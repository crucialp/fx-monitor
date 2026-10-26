// 관리자 전용 방문 통계 JSON — 환율 조회(DB)와 금리 모니터(RATE_DB, 읽기만) 두 사이트. 로그인 쿠키가 없으면 401.
// GET /api/admin/stats?days=7&me=0
//   me=0 이면 내 방문 제외: 환율 조회는 /admin 에 로그인한 브라우저 표시(me=1) 기준,
//   금리 모니터는 /rates/ 통합 뒤엔 같은 쿠키 표시, 그 전 기록은 내 IP 기준. 방문 수는 사람(bot=0)만 세고 봇(같은 규칙)은 bots 로 따로, 목록에는 봇도 bot 표시와 함께 넣는다.
import { isAdmin, PRIVATE } from "../../../lib/auth.js";

const KST = 32400; // 초
const DAYEXPR = `strftime('%Y-%m-%d', ts / 1000 + ${KST}, 'unixepoch')`;

// 사람 방문은 bot = 0, 봇은 따로 센다. IP별·최근 방문 목록에는 봇도 넣고 bot 칸으로 표시(화면에서 '봇' 표시)
const H = "(bot = 0)", B = "(bot = 1)";
const AGG = `SUM(CASE WHEN ${H} THEN 1 ELSE 0 END) n, SUM(CASE WHEN ${B} THEN 1 ELSE 0 END) bots, COUNT(DISTINCT CASE WHEN ${H} THEN ip END) ips`;

async function fxStats(db, since, noMe) {
  const c = noMe ? " AND me = 0" : "";
  const [tot, all, daily, byIp, recent] = await db.batch([
    db.prepare(`SELECT ${AGG}, COUNT(DISTINCT CASE WHEN ${H} THEN vid END) vids FROM visits WHERE ts >= ?${c}`).bind(since),
    db.prepare(`SELECT ${AGG}, MIN(ts) first FROM visits WHERE 1=1${c}`),
    db.prepare(`SELECT ${DAYEXPR} d, ${AGG} FROM visits WHERE ts >= ?${c} GROUP BY d ORDER BY d DESC`).bind(since),
    db.prepare(`SELECT ip, COUNT(*) n, MIN(ts) first, MAX(ts) last, MAX(country) country, MAX(city) city, MAX(org) org, MAX(me) me, MAX(ua) ua, MIN(bot) bot
                FROM visits WHERE ts >= ?${c} GROUP BY ip ORDER BY MIN(bot), n DESC, last DESC LIMIT 400`).bind(since),
    db.prepare(`SELECT ts, ip, country, city, org, ua, ref, host, me, bot FROM visits WHERE ts >= ?${c} ORDER BY ts DESC LIMIT 500`).bind(since),
  ]);
  return { total: tot.results[0], allTime: all.results[0], daily: daily.results, byIp: byIp.results, recent: recent.results };
}

// 금리 모니터를 /rates/ 로 통합한 뒤(RATES_JOINED)부터는 관리자 쿠키로 '나'(me=1)를 표시한다. 그 전 기록은 IP 로만 구분.
const RATES_JOINED = 1792974928684;
async function rateStats(db, since, myIp) {
  const c = myIp ? ` AND me = 0 AND NOT (ts < ${RATES_JOINED} AND ip IS NOT NULL AND ip = ?)` : "";
  const b = (st, ...a) => (myIp ? st.bind(...a, myIp) : st.bind(...a));
  const [tot, all, daily, byIp, recent] = await db.batch([
    b(db.prepare(`SELECT ${AGG} FROM visits WHERE ts >= ?${c}`), since),
    b(db.prepare(`SELECT ${AGG}, MIN(ts) first FROM visits WHERE 1=1${c}`)),
    b(db.prepare(`SELECT ${DAYEXPR} d, ${AGG} FROM visits WHERE ts >= ?${c} GROUP BY d ORDER BY d DESC`), since),
    b(db.prepare(`SELECT ip, COUNT(*) n, MIN(ts) first, MAX(ts) last, MAX(country) country, MAX(city) city, MAX(org) org, MAX(ua) ua, MIN(bot) bot, MAX(me) me
                  FROM visits WHERE ts >= ?${c} GROUP BY ip ORDER BY MIN(bot), n DESC, last DESC LIMIT 400`), since),
    b(db.prepare(`SELECT ts, ip, country, city, org, ua, referer ref, host, query, bot, me FROM visits WHERE ts >= ?${c} ORDER BY ts DESC LIMIT 500`), since),
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
