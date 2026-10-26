// 방문 기록: 사이트 화면이 열릴 때 한 번 보내는 신호(sendBeacon). 접속 IP·대략 위치·통신사·브라우저를 D1 에 남긴다.
// 이 사이트(본체·미리보기·GitHub Pages 백업)에서 온 것만 받는다. 90일 지난 기록은 가끔 지운다.
// 조회는 관리자 페이지(/admin, 비밀번호)에서만.

import { isBot } from "../../lib/botrule.js";

const ALLOW = /^https:\/\/((?:[a-z0-9-]+\.)?fx-monitor\.pages\.dev|crucialp\.github\.io)$/;

export async function onRequestPost(ctx) {
  const { request: req, env } = ctx;
  let origin = req.headers.get("origin") || "";
  if (!ALLOW.test(origin)) { try { origin = new URL(req.headers.get("referer") || "").origin; } catch { origin = ""; } }
  if (!env.DB || !ALLOW.test(origin)) return new Response(null, { status: 204 });
  // 자동 접속(봇·스캐너·헤드리스·데이터센터 회선)은 bot=1 로 표시해 남기고 통계에서 뺀다 — 금리 모니터와 같은 규칙(lib/botrule.js)
  let b = {};
  try { const t = await req.text(); if (t.length < 2000) b = JSON.parse(t) || {}; } catch {}
  const cf = req.cf || {};
  const cut = (v, n) => (typeof v === "string" && v ? v.slice(0, n) : null);
  ctx.waitUntil((async () => {
    await env.DB.prepare("INSERT INTO visits (ts, ip, country, region, city, asn, org, ua, ref, host, vid, me, w, bot) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(Date.now(), req.headers.get("cf-connecting-ip"), cf.country || null, cf.region || null, cf.city || null, cf.asn || null,
        cut(cf.asOrganization, 120), cut(req.headers.get("user-agent"), 300), cut(b.r, 300), origin.replace(/^https:\/\//, ""),
        cut(b.v, 40), b.o ? 1 : 0, Number.isFinite(b.w) ? Math.round(b.w) : null, isBot(req.headers.get("user-agent") || "", cf.asOrganization || "") ? 1 : 0)
      .run();
    if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM visits WHERE ts < ?").bind(Date.now() - 90 * 86400e3).run();
  })().catch(() => {}));
  return new Response(null, { status: 204 });
}
