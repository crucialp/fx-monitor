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

// 한은·일본은행 금리 결정의 실제 발표 시각: 그날 네이버 뉴스에 실린 [속보]/[1보] 기사들의 '입력' 시각(기사 페이지에 초 단위로 박힘)을 모아
// 서로 다른 언론사 2곳 이상이 10분 안에 몰린 가장 이른 시각을 쓴다. 못 찾으면 일정표 시각 그대로.
// (2026-10-22 한은 동결: 연합·경향·아시아경제·뉴스1·뉴시스·마이데일리·중앙 7곳이 09:50:00~09:50:25.
//  RSS·검색 목록의 시각, 인포맥스 공개 사이트(약 2시간 늦게 게시), 기사 '수정' 시각은 틀리므로 쓰지 않는다.)
const CONFIRM = {
  KR: { q: "속보 한은 기준금리", who: /한은|한국은행|금통위/, what: /금리/, act: /동결|인상|인하/, before: 60, after: 240 },
  JP: { q: "속보 일본은행 금리", who: /일본은행|日銀|일은|BOJ/i, what: /금리/, act: /동결|인상|인하/, before: 180, after: 300 },
};
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "accept-language": "ko-KR,ko;q=0.9" };
const kstDate = (min) => new Date(min * 60000 + 9 * 3600e3).toISOString().slice(0, 10);

const isFlash = (cf, title) => /속보|1보/.test(title) && cf.who.test(title) && cf.what.test(title) && cf.act.test(title);

// 검색 결과 카드마다 '네이버뉴스' 링크 → 제목(.tit) 순서로 나온다. 제목으로 먼저 거르고 남은 기사만 열어 본다(요청 수 절약).
// 정확도순과 오래된순을 함께 본다: 오래된순만 보면 아침 '오늘 금통위…' 예고 기사가 첫 쪽을 채우는 날이 있다(2026-08-27).
async function naverFirst(cf, ds, sched) {
  const d = ds.replace(/-/g, ".");
  const cand = new Map();
  const pages = await Promise.all([0, 2].map(async (sort) => {
    const url = `https://search.naver.com/search.naver?where=news&query=${encodeURIComponent(cf.q)}&sort=${sort}&pd=3&ds=${d}&de=${d}`;
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`네이버 검색 HTTP ${r.status}`);
    return r.text();
  }));
  for (const h of [pages[1], pages[0]]) {   // 오래된순 먼저(첫 속보가 앞에 옴)
    const links = [...h.matchAll(/https:\/\/n\.news\.naver\.com\/mnews\/article\/\d+\/\d+/g)].map((m) => [m.index, m[0]]);
    for (const m of h.matchAll(/data-heatmap-target="\.tit"><span[^>]*>(.*?)<\/span>/g)) {
      const title = m[1].replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      let link = null;
      for (const [p, l] of links) { if (p < m.index && m.index - p < 4000) link = l; if (p > m.index) break; }
      if (link && isFlash(cf, title) && !cand.has(link)) cand.set(link, title);
    }
  }
  // 제목 짝을 못 찾은 오래된순 링크도 자리가 남으면 연다(제목은 기사 페이지에서 다시 거른다)
  for (const m of pages[1].matchAll(/https:\/\/n\.news\.naver\.com\/mnews\/article\/\d+\/\d+/g)) if (cand.size < 12 && !cand.has(m[0])) cand.set(m[0], "");
  const arts = await Promise.all([...cand.keys()].slice(0, 12).map(async (l) => {
    try {
      const h = await (await fetch(l, { headers: UA, signal: AbortSignal.timeout(5000) })).text();
      const t = /data-date-time="(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})"/.exec(h);   // 입력 시각 (한국 시간)
      const ti = /<meta property="og:title" content="([^"]+)"/.exec(h);
      if (!t || !ti) return null;
      const sec = (Date.UTC(+t[1], t[2] - 1, +t[3], +t[4], +t[5], +t[6]) - 9 * 3600e3) / 1000;
      return { sec, title: ti[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"), press: l.split("/")[5], url: l };
    } catch (err) { return { fail: l.split("/").slice(5).join("/") + " " + String((err && err.message) || err) }; }
  }));
  const fails = arts.filter((a) => a && a.fail).map((a) => a.fail);
  const ok = arts.filter((a) => a && !a.fail && isFlash(cf, a.title)
    && a.sec / 60 >= sched - cf.before && a.sec / 60 <= sched + cf.after).sort((a, b) => a.sec - b.sec);
  for (const a of ok) {
    const near = ok.filter((b) => b.sec >= a.sec && b.sec - a.sec <= 600);
    const press = new Set(near.map((b) => b.press));
    if (press.size >= 2) return { t: Math.floor(a.sec / 60), n: press.size, title: a.title, url: a.url, checked: cand.size, fails };
  }
  return { t: null, n: ok.length, checked: cand.size, fails };
}

async function confirmTime(ctx, e, fresh) {
  const cf = CONFIRM[e.cc];
  if (!cf || e.k !== "rate" || Date.now() / 60000 < e.t - cf.before) return null;
  const key = new Request(`https://cache.usdkrw.local/confirm-v5-${e.cc}-${kstDate(e.t)}`);
  const hit = fresh ? null : await caches.default.match(key);
  if (hit) return hit.json();
  let res;
  try { res = await naverFirst(cf, kstDate(e.t), e.t); } catch (err) { res = { t: null, error: String((err && err.message) || err) }; }
  // 찾았고 기사를 모두 열어 봤으면 한 달 고정. 일부 기사를 못 열었으면 1시간 뒤(더 이른 속보가 빠졌을 수 있음), 못 찾았으면 5분 뒤 다시
  const ttl = res.t == null ? 300 : (res.fails && res.fails.length) ? 3600 : 30 * 86400;
  ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(res), { headers: { "content-type": "application/json", "cache-control": `public, max-age=${ttl}` } })));
  return res;
}

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
  const events = normalize(results.flat().filter((x) => !x._error)).filter((e) => e.t >= from - 240 && e.t <= to + 240);
  await Promise.all(events.map(async (e) => {
    const c = await confirmTime(ctx, e, u.searchParams.has("fresh"));
    if (c && u.searchParams.has("fresh")) e._check = c;   // 점검용: ?fresh=1 이면 캐시 없이 다시 찾고 과정을 보여 줌
    if (c && c.t != null) { e.ts = e.t; e.t = c.t; e.approx = false; e.tsrc = `언론 ${c.n}곳 첫 속보`; e.turl = c.url; }
    else if (c && c.error) errors.push(e.cc + " 발표 시각 확인 실패: " + c.error);
  }));
  for (let i = events.length - 1; i >= 0; i--) if (events[i].t < from || events[i].t > to) events.splice(i, 1);
  events.sort((a, b) => a.t - b.t);
  return new Response(JSON.stringify({ updated: kstNow().iso, source: "Nasdaq 경제 캘린더 · 한은·일본은행 결정 시각은 언론 첫 속보(네이버 뉴스 입력 시각)", from, to, errors, events }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "access-control-allow-origin": "*" },
  });
}
export const onRequestOptions = options;
