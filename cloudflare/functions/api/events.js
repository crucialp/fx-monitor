// 주요 경제지표·금리 결정 (Nasdaq 경제 캘린더: 발표치·예상치·이전치). 2분 캐시.
// GET /api/events?from=<epoch분>&to=<epoch분>  → 그 구간의 지정 이벤트만
// 사용자가 지정한 것만: 미국·한국·일본·유로존 금리 결정, 미국 CPI·PPI·PCE(전년비), 미국 신규 실업수당·실업률·비농업,
// 미국·한국·일본 GDP(미국·일본은 연율, 속보/잠정/확정 구분).
import { kstNow, options } from "../../lib/common.js";

// Nasdaq 시각은 미국 동부시간이고, date=D 로 받은 행은 실제로는 동부시간 D-1 일의 발표다
// (확인: 실업수당 청구가 목요일 대신 금요일 날짜에, 9/16 FOMC 결정이 9/17 날짜에 실림).
function nyOffset(utcMs) {
  const y = new Date(utcMs).getUTCFullYear();
  const nthSunday = (m, n) => { const d = new Date(Date.UTC(y, m, 1)); const first = (7 - d.getUTCDay()) % 7 + 1; return first + 7 * (n - 1); };
  const start = Date.UTC(y, 2, nthSunday(2, 2), 7);   // 3월 둘째 일요일 02:00 EST
  const end = Date.UTC(y, 10, nthSunday(10, 1), 6);   // 11월 첫 일요일 02:00 EDT
  return utcMs >= start && utcMs < end ? -4 : -5;
}
function toMinute(dateStr, hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hm || "").trim());
  if (!m) return null;
  let [y, mo, d] = dateStr.split("-").map(Number);
  let hh = +m[1], mm = +m[2];
  let naive = Date.UTC(y, mo - 1, d, hh, mm);
  naive -= 86400e3;
  return Math.floor((naive - nyOffset(naive) * 3600e3) / 60000);
}

const clean = (v) => {
  const s = String(v ?? "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim();
  return s === "" ? null : s;
};
const num = (v) => { const m = /-?\d+(?:\.\d+)?/.exec(String(v || "").replace(/,/g, "")); return m ? parseFloat(m[0]) : null; };

function stage(country, utcMin) {
  const mo = new Date(utcMin * 60000 + 9 * 3600e3).getUTCMonth() + 1;
  if (country === "US") return [1, 4, 7, 10].includes(mo) ? "속보" : [2, 5, 8, 11].includes(mo) ? "잠정" : "확정";
  if (country === "KR") return [1, 4, 7, 10].includes(mo) ? "속보" : "잠정";
  if (country === "JP") return [2, 5, 8, 11].includes(mo) ? "1차 속보" : "2차 속보";
  return "";
}

// pick: 같은 이름이 둘(전월비·전년비 등)일 때 고르는 법 — "big" 은 |이전치|가 큰 쪽(전년비), "small" 은 작은 쪽(전기비)
const RULES = [
  { c: "United States", re: /^Fed Interest Rate Decision$/i, cc: "US", k: "rate", label: "美 기준금리(연준)" },
  { c: "United States", re: /^CPI$/i, cc: "US", k: "cpi", label: "美 CPI(전년비)", pick: "big" },
  { c: "United States", re: /^PPI$/i, cc: "US", k: "ppi", label: "美 PPI(전년비)", pick: "big" },
  { c: "United States", re: /^PCE Price index$/i, cc: "US", k: "pce", label: "美 PCE 물가(전년비)", pick: "big" },
  { c: "United States", re: /^Initial Jobless Claims$/i, cc: "US", k: "claims", label: "美 신규 실업수당 청구" },
  { c: "United States", re: /^Unemployment Rate$/i, cc: "US", k: "unemp", label: "美 실업률" },
  { c: "United States", re: /^Non-?farm Payrolls$/i, cc: "US", k: "nfp", label: "美 비농업 고용" },
  { c: "United States", re: /^GDP( \(QoQ\))?$/i, cc: "US", k: "gdp", label: "美 GDP(연율", pick: "first" },
  { c: "South Korea", re: /Interest Rate Decision/i, cc: "KR", k: "rate", label: "한은 기준금리" },
  { c: "South Korea", re: /^GDP(?!.*(Price|Deflator))/i, cc: "KR", k: "gdp", label: "한국 GDP(전기비", pick: "small" },
  { c: "Japan", re: /BoJ Interest Rate Decision/i, cc: "JP", k: "rate", label: "日 기준금리(일본은행)" },
  { c: "Japan", re: /GDP Annualized/i, cc: "JP", k: "gdp", label: "日 GDP(연율", pick: "first" },
  { c: "Euro Zone", re: /ECB Interest Rate Decision/i, cc: "EU", k: "rate", label: "ECB 기준금리" },
];

async function day(dateStr) {
  const r = await fetch(`https://api.nasdaq.com/api/calendar/economicevents?date=${dateStr}`, {
    headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", accept: "application/json", "accept-language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(6000),
  });
  if (!r.ok) throw new Error(`Nasdaq HTTP ${r.status}`);
  const rows = ((await r.json()).data || {}).rows || [];
  return rows.map((x) => ({ ...x, _date: dateStr }));
}

function normalize(rows) {
  const groups = new Map();
  for (const x of rows) {
    const rule = RULES.find((ru) => ru.c === x.country && ru.re.test(String(x.eventName || "").trim()));
    if (!rule) continue;
    const t = toMinute(x._date, x.gmt);
    if (t == null) continue;
    const key = rule.cc + rule.k + t;
    if (!groups.has(key)) groups.set(key, { rule, t, rows: [] });
    groups.get(key).rows.push(x);
  }
  const out = [];
  for (const { rule, t, rows: g } of groups.values()) {
    let row = g[0];
    if (g.length > 1 && (rule.pick === "big" || rule.pick === "small")) {
      const mag = (r) => Math.abs(num(clean(r.previous)) ?? num(clean(r.actual)) ?? 0);
      row = g.slice().sort((a, b) => (rule.pick === "big" ? mag(b) - mag(a) : mag(a) - mag(b)))[0];
    }
    const actual = clean(row.actual), forecast = clean(row.consensus), previous = clean(row.previous);
    let label = rule.label;
    if (rule.k === "gdp") label += ", " + stage(rule.cc, t) + ")";
    let note = null;
    if (rule.k === "rate" && actual && previous) {
      const d = Math.round(((num(actual) ?? 0) - (num(previous) ?? 0)) * 100) / 100;
      note = d === 0 ? "동결" : d > 0 ? `인상 +${d.toFixed(2)}%p` : `인하 ${d.toFixed(2)}%p`;
    }
    out.push({ t, cc: rule.cc, k: rule.k, label, actual, forecast, previous, note, approx: rule.cc === "JP" && rule.k === "rate" });
  }
  return out.sort((a, b) => a.t - b.t);
}

// 발표 시각은 일정표(Nasdaq) 기준. 뉴스 피드 시각은 언론사·검색엔진마다 틀리거나(미리 써 둔 기사, 시간대 오류) 늦게 수집돼
// 실제 결정 시각을 잡는 데 쓰지 않는다(2026-10-22 확인). 일본은행은 정해진 발표 시각이 없어 '대략'으로 표시.
export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url);
  const now = Math.floor(Date.now() / 60000);
  const to = Math.min(+(u.searchParams.get("to") || now + 1440), now + 14 * 1440);
  const from = Math.max(+(u.searchParams.get("from") || now - 1440), to - 8 * 1440); // Cloudflare 무료 한도(요청당 외부 호출 50회) 때문에 최대 8일
  // 필요한 Nasdaq 날짜: 구간의 KST 날짜 앞뒤로 하루씩 넉넉히 (Nasdaq 날짜는 동부시간 +1일)
  const dates = [];
  for (let m = from - 1440; m <= to + 2 * 1440; m += 1440) {
    const ds = new Date(m * 60000 + 9 * 3600e3).toISOString().slice(0, 10);
    if (!dates.includes(ds)) dates.push(ds);
  }
  const cache = caches.default;
  const results = await Promise.all(dates.slice(0, 12).map(async (ds) => {
    const key = new Request(`https://cache.usdkrw.local/nasdaq-${ds}`);
    const hit = await cache.match(key);
    if (hit) return hit.json();
    try {
      const rows = await day(ds);
      // 지난 날짜는 1일, 오늘·앞으로는 2분 캐시 (발표 직후 실제치가 들어옴)
      const ttl = ds < kstNow().date ? 86400 : 120;
      ctx.waitUntil(cache.put(key, new Response(JSON.stringify(rows), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl}` } })));
      return rows;
    } catch (e) {
      return [{ _error: String(e && e.message || e), _date: ds }];
    }
  }));
  const errors = results.flat().filter((x) => x._error).map((x) => x._date + " " + x._error);
  const events = normalize(results.flat().filter((x) => !x._error)).filter((e) => e.t >= from && e.t <= to);
  return new Response(JSON.stringify({ updated: kstNow().iso, source: "Nasdaq 경제 캘린더", from, to, errors, events }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
  });
}
export const onRequestOptions = options;
