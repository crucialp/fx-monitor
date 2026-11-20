// 앱 환율 알림 발송: 매분 켜진 알림(push_sub.act=1)만 읽어 조건을 확인하고 Web Push 로 보낸다.
// 시세는 앱 화면과 같은 값(/api/intraday 1분 시세, Yahoo 가 끊긴 구간은 Wise 로 메운 값)을 쓴다.
import { sendPush } from "../../cloudflare/lib/webpush.js";
import { CURS, f1, sign } from "../../cloudflare/lib/alerts.js";

const SITE = "https://fx-monitor.pages.dev";
const SWING_GAP = 120;   // 분: 같은 통화 급변 알림 간격
const parse = (s, d) => { try { const v = JSON.parse(s); return v && typeof v === "object" ? v : d; } catch { return d; } };

async function price(c, m) {
  try {
    const r = await fetch(`${SITE}/api/intraday${c === "usd" ? "" : "?c=" + c}`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const d = await r.json(), t = d.m1.t, v = d.m1.c, n = t.length;
    if (!n || m - t[n - 1] > 15) return null;   // 15분 넘게 새 값이 없으면(주말 등) 판단하지 않는다
    let ago = null, bd = 11;
    for (let i = n - 1; i >= 0 && t[i] >= m - 75; i--) { const d0 = Math.abs(t[i] - (m - 60)); if (d0 < bd) { bd = d0; ago = v[i]; } }
    return { now: v[n - 1], ago, at: t[n - 1] };
  } catch { return null; }
}
const kst = (m) => { const d = new Date((m + 540) * 60000); return { ymd: d.toISOString().slice(0, 10), hm: d.toISOString().slice(11, 16), wd: d.getUTCDay() }; };

async function morning() {
  try {
    const r = await fetch(`${SITE}/api/brief?k=fx`, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const b = await r.json();
    return { title: "아침 환율 요약 · " + (b.title || ""), body: (b.lines || []).map((x) => x.text).slice(0, 2).join("\n") };
  } catch { return null; }
}

export async function runAlerts(env, m) {
  if (!env.VAPID_PRIVATE) return;
  const rows = (await env.DB.prepare("SELECT id, endpoint, p256dh, auth, rules, state FROM push_sub WHERE act = 1").all()).results || [];
  if (!rows.length) return;
  const k = kst(m), weekday = k.wd >= 1 && k.wd <= 5, mornTime = weekday && k.hm >= "08:30" && k.hm < "08:45";
  const need = new Set();
  rows.forEach((r) => { const R = parse(r.rules, {}); (R.t || []).forEach((x) => x.on && need.add(x.c)); (R.s || []).forEach((x) => x.on && need.add(x.c)); });
  const P = {};
  await Promise.all([...need].map(async (c) => { P[c] = await price(c, m); }));
  let brief;   // 아침 요약은 필요할 때 한 번만 받는다

  const upd = env.DB.prepare("UPDATE push_sub SET rules = ?, state = ?, act = ? WHERE id = ?");
  const del = env.DB.prepare("DELETE FROM push_sub WHERE id = ?");
  const writes = [];
  for (const r of rows) {
    const R = parse(r.rules, {}), S = parse(r.state, {});
    R.t = R.t || []; R.s = R.s || []; R.m = R.m || {};
    S.t = S.t || {}; S.s = S.s || {};
    const out = [];
    for (const x of R.t) {
      const p = P[x.c];
      if (!x.on || !p) continue;
      if ((x.op === "ge" && p.now >= x.v) || (x.op === "le" && p.now <= x.v)) {
        out.push({ title: `${CURS[x.c].name} ${f1(x.v)}원 ${x.op === "ge" ? "이상" : "이하"} 도달`,
          body: `지금 ${f1(p.now)}원입니다. 이 알림은 꺼졌고, 앱의 알림 탭에서 다시 켤 수 있습니다.`, tag: "t-" + x.id, url: `/app/#c=${x.c}` });
        x.on = false; S.t[x.id] = m;
      }
    }
    for (const x of R.s) {
      const p = P[x.c];
      if (!x.on || !p || p.ago === null) continue;
      const d = p.now - p.ago;
      if (Math.abs(d) >= x.w && !(S.s[x.c] && m - S.s[x.c] < SWING_GAP)) {
        out.push({ title: `${CURS[x.c].name} 1시간 새 ${sign(d)}원 ${d > 0 ? "급등" : "급락"}`,
          body: `지금 ${f1(p.now)}원 (1시간 전 ${f1(p.ago)}원). 정한 기준 ${f1(x.w)}원 이상 움직임.`, tag: "s-" + x.c, url: `/app/#c=${x.c}` });
        S.s[x.c] = m;
      }
    }
    if (R.m.on && mornTime && S.m !== k.ymd) {
      if (brief === undefined) brief = await morning();
      if (brief) { out.push({ ...brief, tag: "morning", url: "/app/" }); S.m = k.ymd; }
    }
    if (!out.length) continue;
    let gone = false;
    for (const msg of out) {
      const res = await sendPush({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, msg, env.VAPID_PRIVATE).catch((e) => ({ ok: false, status: String(e) }));
      if (res.gone) { gone = true; break; }
      if (!res.ok) console.log(`push ${r.id.slice(0, 8)} 실패 ${res.status}`);
    }
    const act = R.t.some((x) => x.on) || R.s.some((x) => x.on) || R.m.on ? 1 : 0;
    writes.push(gone ? del.bind(r.id) : upd.bind(JSON.stringify(R), JSON.stringify(S), act, r.id));
  }
  if (writes.length) await env.DB.batch(writes);
}

// 하루 한 번: 180일 동안 앱을 안 연 구독 지우기
export async function sweepSubs(env, m) {
  await env.DB.prepare("DELETE FROM push_sub WHERE seen < ?").bind((m - 180 * 1440) * 60000).run();
}
