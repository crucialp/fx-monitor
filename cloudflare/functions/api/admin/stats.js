// 관리자 전용 방문 통계 JSON. 로그인 쿠키가 없으면 401.
// GET /api/admin/stats?days=7&me=0   (me=0 이면 '내 방문' 표시된 기록 제외)
import { isAdmin, PRIVATE } from "../../../lib/auth.js";

const KST = 32400; // 초

export async function onRequestGet(ctx) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...PRIVATE } });
  if (!(await isAdmin(ctx))) return json({ error: "로그인이 필요합니다" }, 401);
  const db = ctx.env.DB;
  if (!db) return json({ error: "방문 기록 DB 가 연결되지 않았습니다" }, 500);
  const u = new URL(ctx.request.url);
  const days = Math.min(Math.max(+(u.searchParams.get("days") || 7), 1), 90);
  const noMe = u.searchParams.get("me") === "0";
  // '오늘'은 한국 시간 0시부터, 그 외는 그날 0시부터 days 일
  const now = Date.now();
  const today0 = Math.floor((now + KST * 1000) / 86400e3) * 86400e3 - KST * 1000;
  const since = today0 - (days - 1) * 86400e3;
  const meCond = noMe ? " AND me = 0" : "";
  const day = `strftime('%Y-%m-%d', ts / 1000 + ${KST}, 'unixepoch')`;
  const [tot, all, daily, byIp, recent] = await db.batch([
    db.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT ip) ips, COUNT(DISTINCT vid) vids FROM visits WHERE ts >= ?${meCond}`).bind(since),
    db.prepare(`SELECT COUNT(*) n, MIN(ts) first FROM visits WHERE 1=1${meCond}`),
    db.prepare(`SELECT ${day} d, COUNT(*) n, COUNT(DISTINCT ip) ips, COUNT(DISTINCT vid) vids FROM visits WHERE ts >= ?${meCond} GROUP BY d ORDER BY d DESC`).bind(since),
    db.prepare(`SELECT ip, COUNT(*) n, COUNT(DISTINCT vid) vids, MIN(ts) first, MAX(ts) last, MAX(country) country, MAX(city) city, MAX(org) org, MAX(me) me, MAX(ua) ua
                FROM visits WHERE ts >= ?${meCond} GROUP BY ip ORDER BY n DESC, last DESC LIMIT 300`).bind(since),
    db.prepare(`SELECT ts, ip, country, region, city, org, ua, ref, host, me, w FROM visits WHERE ts >= ?${meCond} ORDER BY ts DESC LIMIT 500`).bind(since),
  ]);
  return json({
    you: ctx.request.headers.get("cf-connecting-ip"),
    days, since, now,
    total: tot.results[0], allTime: all.results[0],
    daily: daily.results, byIp: byIp.results, recent: recent.results,
  });
}
