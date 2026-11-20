// 앱 환율 알림 API (/api/push/...) — 화면은 public/app/. 표는 schema/push_sub.sql(D1 fx-monitor-visits).
//  POST save   {sub:{endpoint,keys:{p256dh,auth}}, rules}  구독·알림 조건 저장(덮어쓰기)
//  POST get    {endpoint}  저장된 조건과 발송 기록(목표 환율이 닿아 꺼진 것 등)을 앱에 돌려줌
//  POST delete {endpoint}  구독 지우기
//  POST test   {endpoint}  테스트 알림 한 번(1분에 1번)
// 가입이 없으므로 구독 주소(endpoint)를 아는 기기만 자기 조건을 보고 바꿀 수 있다. 같은 사이트 화면에서 보낸 JSON 만 받는다.
import { sendPush, okEndpoint } from "../../../lib/webpush.js";
import { cleanRules, active } from "../../../lib/alerts.js";

const MAX_SUBS = 20000;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
});
const fail = (msg, status = 400) => json({ error: msg }, status);

async function idOf(ep) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ep)));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
const b64ok = (s, min, max) => typeof s === "string" && s.length >= min && s.length <= max && /^[\w-]+=*$/.test(s);
const parse = (s, d) => { try { const v = JSON.parse(s); return v && typeof v === "object" ? v : d; } catch { return d; } };

export async function onRequestPost(ctx) {
  try { return await handle(ctx); } catch (e) {
    console.log("push api 오류: " + (e && e.stack || e));
    return fail("서버 오류가 났습니다. 잠시 후 다시 시도해 주세요.", 500);
  }
}
async function handle(ctx) {
  const { request: req, env, params } = ctx;
  const db = env.DB, act = (params.path || [])[0];
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return fail("다른 사이트에서 보낸 요청입니다.", 403);
  if (!/^application\/json\b/i.test(req.headers.get("content-type") || "")) return fail("잘못된 요청입니다.");
  const t = await req.text();
  if (t.length > 8000) return fail("요청이 너무 깁니다.");
  const b = parse(t, null);
  if (!b || typeof b !== "object") return fail("잘못된 요청입니다.");
  const ep = (b.sub && b.sub.endpoint) || b.endpoint;
  if (!okEndpoint(ep)) return fail("알림 구독 정보가 올바르지 않습니다.");
  const id = await idOf(ep), now = Date.now();

  if (act === "save") {
    const k = b.sub.keys || {};
    if (!b64ok(k.p256dh, 80, 100) || !b64ok(k.auth, 16, 30)) return fail("알림 구독 정보가 올바르지 않습니다.");
    const rules = cleanRules(b.rules);
    const old = await db.prepare("SELECT state FROM push_sub WHERE id = ?").bind(id).first();
    if (!old) {
      const n = await db.prepare("SELECT COUNT(*) AS n FROM push_sub").first();
      if (n && n.n >= MAX_SUBS) return fail("알림 신청이 너무 많아 잠시 받을 수 없습니다.", 503);
    }
    const st = parse(old && old.state, {});
    // 다시 켠 목표 환율은 발송 기록을 지워 다시 보낼 수 있게
    if (st.t) for (const x of rules.t) if (x.on) delete st.t[x.id];
    await db.prepare(`INSERT INTO push_sub (id, endpoint, p256dh, auth, rules, state, act, created, seen) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
      ON CONFLICT(id) DO UPDATE SET endpoint = ?2, p256dh = ?3, auth = ?4, rules = ?5, state = ?6, act = ?7, seen = ?8`)
      .bind(id, ep, k.p256dh, k.auth, JSON.stringify(rules), JSON.stringify(st), active(rules), now).run();
    return json({ ok: true, rules, state: st });
  }

  const row = await db.prepare("SELECT * FROM push_sub WHERE id = ?").bind(id).first();
  if (act === "get") {
    if (!row) return json({ ok: true, none: true });
    await db.prepare("UPDATE push_sub SET seen = ? WHERE id = ?").bind(now, id).run();
    return json({ ok: true, rules: parse(row.rules, {}), state: parse(row.state, {}) });
  }
  if (act === "delete") {
    await db.prepare("DELETE FROM push_sub WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  if (act === "test") {
    if (!row) return fail("먼저 알림을 켜 주세요.", 404);
    if (!env.VAPID_PRIVATE) return fail("알림 발송 설정이 아직 안 되어 있습니다.", 503);
    const st = parse(row.state, {}), min = Math.floor(now / 60000);
    if (st.test && min - st.test < 1) return fail("테스트 알림은 1분에 한 번만 보낼 수 있습니다.", 429);
    st.test = min;
    await db.prepare("UPDATE push_sub SET state = ?, seen = ? WHERE id = ?").bind(JSON.stringify(st), now, id).run();
    const r = await sendPush({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      { title: "환율 조회 · 테스트 알림", body: "알림이 잘 옵니다. 정한 조건에 닿으면 이렇게 알려 드립니다.", tag: "test", url: "/app/#alerts" }, env.VAPID_PRIVATE);
    if (r.gone) { await db.prepare("DELETE FROM push_sub WHERE id = ?").bind(id).run(); return fail("알림 구독이 만료됐습니다. 알림을 다시 켜 주세요.", 410); }
    return r.ok ? json({ ok: true }) : fail(`알림 서버가 받지 않았습니다(${r.status}).`, 502);
  }
  return fail("Not Found", 404);
}
