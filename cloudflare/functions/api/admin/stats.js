// 관리자 전용 방문 통계 JSON — 환율 조회(DB)와 금리 모니터(RATE_DB, 읽기만) 두 사이트. 로그인 쿠키가 없으면 401.
// GET /api/admin/stats?days=7&me=0
//   me=0 이면 내 방문 제외: 환율 조회는 /admin 에 로그인한 브라우저 표시(me=1) 기준,
//   금리 모니터는 그런 표시가 없어 지금 내 IP 기준(같은 회사망 동료 방문도 함께 빠질 수 있음). 두 사이트 모두 봇(bot=1, 같은 규칙)은 늘 제외.
import { isAdmin, PRIVATE } from "../../../lib/auth.js";

const KST = 32400; // 초
const DAYEXPR = `strftime('%Y-%m-%d', ts / 1000 + ${KST}, 'unixepoch')`;

async function fxStats(db, since, noMe) {
  const c = " AND bot = 0" + (noMe ? " AND me = 0" : "");
  const [tot, all, daily, byIp, recent] = await db.batch([
    db.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT ip) ips, COUNT(DISTINCT vid) vids FROM visits WHERE ts >= ?${c}`).bind(since),
    db.prepare(`SELECT COUNT(*) n, MIN(ts) first FROM visits WHERE 1=1${c}`),
    db.prepare(`SELECT ${DAYEXPR} d, COUNT(*) n, COUNT(DISTINCT ip) ips FROM visits WHERE ts >= ?${c} GROUP BY d ORDER BY d DESC`).bind(since),
    db.prepare(`SELECT ip, COUNT(*) n, MIN(ts) first, MAX(ts) last, MAX(country) country, MAX(city) city, MAX(org) org, MAX(me) me, MAX(ua) ua
                FROM visits WHERE ts >= ?${c} GROUP BY ip ORDER BY n DESC, last DESC LIMIT 300`).bind(since),
    db.prepare(`SELECT ts, ip, country, city, org, ua, ref, host, me FROM visits WHERE ts >= ?${c} ORDER BY ts DESC LIMIT 500`).bind(since),
  ]);
  return { total: tot.results[0], allTime: all.results[0], daily: daily.results, byIp: byIp.results, recent: recent.results };
}

async function rateStats(db, since, myIp) {
  const c = " AND bot = 0" + (myIp ? " AND (ip IS NULL OR ip != ?)" : "");
  const b = (st, ...a) => (myIp ? st.bind(...a, myIp) : st.bind(...a));
  const [tot, all, daily, byIp, recent] = await db.batch([
    b(db.prepare(`SELECT COUNT(*) n, COUNT(DISTINCT ip) ips FROM visits WHERE ts >= ?${c}`), since),
    b(db.prepare(`SELECT COUNT(*) n, MIN(ts) first FROM visits WHERE 1=1${c}`)),
    b(db.prepare(`SELECT ${DAYEXPR} d, COUNT(*) n, COUNT(DISTINCT ip) ips FROM visits WHERE ts >= ?${c} GROUP BY d ORDER BY d DESC`), since),
    b(db.prepare(`SELECT ip, COUNT(*) n, MIN(ts) first, MAX(ts) last, MAX(country) country, MAX(city) city, MAX(org) org, MAX(ua) ua
                  FROM visits WHERE ts >= ?${c} GROUP BY ip ORDER BY n DESC, last DESC LIMIT 300`), since),
    b(db.prepare(`SELECT ts, ip, country, city, org, ua, referer ref, host, query FROM visits WHERE ts >= ?${c} ORDER BY ts DESC LIMIT 500`), since),
  ]);
  return { total: tot.results[0], allTime: all.results[0], daily: daily.results, byIp: byIp.results, recent: recent.results };
}

export async function onRequestGet(ctx) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...PRIVATE } });
  if (!(await isAdmin(ctx))) return json({ error: "로그인이 필요합니다" }, 401);
  const u = new URL(ctx.request.url);
  const days = Math.min(Math.max(+(u.searchParams.get("days") || 7), 1), 90);
  const noMe = u.searchParams.get("me") === "0";
  const you = ctx.request.headers.get("cf-connecting-ip") || "";
  // '오늘'은 한국 시간 0시부터, 그 외는 그날 0시부터 days 일
  const now = Date.now();
  const today0 = Math.floor((now + KST * 1000) / 86400e3) * 86400e3 - KST * 1000;
  const since = today0 - (days - 1) * 86400e3;
  const sites = {};
  const run = async (name, fn) => { try { sites[name] = await fn(); } catch (e) { sites[name] = { error: String((e && e.message) || e) }; } };
  await Promise.all([
    ctx.env.DB ? run("fx", () => fxStats(ctx.env.DB, since, noMe)) : null,
    ctx.env.RATE_DB ? run("rate", () => rateStats(ctx.env.RATE_DB, since, noMe ? you : null)) : null,
  ]);
  return json({ you, days, since, now, sites });
}
