// 5페이지 비교 차트용 금리 계열: /api/macro?s=계열&r=기간 — 나라별 정책금리·국채 금리(일별)와 금리차.
// 정해 둔 계열·기간만 받는다(아무 주소나 대신 받아 주는 중계가 되지 않게). 결과 30분 캐시.
// 출처(모두 공개 공식 자료):
//   한국  한국은행 ECOS(금리 모니터가 매시 모아 둔 rates.csv)
//   미국  재무부 일별 국채 수익률 곡선 · 뉴욕연은 EFFR(정책금리 목표 범위 포함)
//   일본  재무성 국채 금리 · 일본은행 무담보콜(1일)
//   유로  ECB 예금금리 · 독일 분데스방크 국채 수익률 곡선
//   영국  영란은행 기준금리·10년 국채
import { cached, options } from "../../lib/common.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const KR_CSV = "https://raw.githubusercontent.com/crucialp/rate-monitor/main/docs/data/rates.csv";

const S = {
  kr_base: { kr: "base" }, kr_call: { kr: "call" }, kr_cd91: { kr: "cd91" }, kr_cp91: { kr: "cp91" }, kr_msb1: { kr: "msb1" },
  kr_ktb1: { kr: "ktb1" }, kr_ktb2: { kr: "ktb2" }, kr_ktb3: { kr: "ktb3" }, kr_ktb5: { kr: "ktb5" }, kr_ktb10: { kr: "ktb10" },
  kr_ktb20: { kr: "ktb20" }, kr_ktb30: { kr: "ktb30" }, kr_kdb1: { kr: "kdb1" }, kr_aa3: { kr: "aa3" }, kr_bbb3: { kr: "bbb3" },
  us_fftu: { ny: "targetRateTo" }, us_effr: { ny: "percentRate" },
  us_3m: { ust: "3 Mo" }, us_2y: { ust: "2 Yr" }, us_5y: { ust: "5 Yr" }, us_10y: { ust: "10 Yr" }, us_30y: { ust: "30 Yr" },
  jp_call: { boj: "STRDCLUCON" }, jp_2y: { mof: "2Y" }, jp_5y: { mof: "5Y" }, jp_10y: { mof: "10Y" }, jp_30y: { mof: "30Y" },
  ez_dfr: { ecb: "D.U2.EUR.4F.KR.DFR.LEV" }, de_2y: { bbk: "R02XX" }, de_10y: { bbk: "R10XX" },
  uk_bank: { boe: "IUDBEDR" }, uk_10y: { boe: "IUDMNPY" },
  // 금리차(앞 − 뒤, %p). 정책금리처럼 띄엄띄엄 바뀌는 쪽은 최근 값(7일 이내)을 이어 쓴다
  sp_krus_base: { diff: ["kr_base", "us_fftu"] }, sp_krus_2y: { diff: ["kr_ktb2", "us_2y"] },
  sp_krus_10y: { diff: ["kr_ktb10", "us_10y"] }, sp_us_10_2: { diff: ["us_10y", "us_2y"] },
  sp_kr_10_3: { diff: ["kr_ktb10", "kr_ktb3"] }, sp_jp_us_10y: { diff: ["us_10y", "jp_10y"] },
};
// 기간 → 며칠 전부터
const RANGE = { "1m": 35, "3m": 100, "1y": 370, "3y": 3 * 366 + 10, "10y": 10 * 366 + 10, "20y": 20 * 366 + 10 };

// ttl 0 이면 Cloudflare 캐시 옵션 없이 받는다(미 재무부는 cacheEverything 요청을 403 으로 막음 — 결과는 바깥 cached() 가 30분 보관)
async function get(url, ttl, accept = "*/*") {
  let last;
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, ttl ? { headers: { "user-agent": UA, accept }, cf: { cacheTtl: ttl, cacheEverything: true } } : { headers: { "user-agent": UA, accept } });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${new URL(url).hostname}`);
      return await r.text();
    } catch (e) { last = e; }
  }
  throw last;
}
const ymd = (d) => d.toISOString().slice(0, 10);
const num = (x) => { const v = parseFloat(String(x).replace(",", ".")); return Number.isFinite(v) ? v : null; };
const isWeekend = (d) => { const w = new Date(d + "T00:00:00Z").getUTCDay(); return w === 0 || w === 6; };

/* ---- 출처별 읽기: 모두 [["YYYY-MM-DD", 값], …] 을 날짜순으로 ---- */
async function kr(col) {
  const lines = (await get(KR_CSV, 1800)).trim().split(/\r?\n/), head = lines[0].split(","), j = head.indexOf(col), out = [];
  for (let i = 1; i < lines.length; i++) {
    const f = lines[i].split(","), v = num(f[j]);
    if (v !== null) out.push([`${f[0].slice(0, 4)}-${f[0].slice(4, 6)}-${f[0].slice(6, 8)}`, v]);
  }
  return out;
}
async function ny(field, start, today) {
  const j = JSON.parse(await get(`https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate=${start}&endDate=${today}`, 3600, "application/json"));
  return (j.refRates || []).map((x) => [x.effectiveDate, num(x[field])]).filter((p) => p[1] !== null).sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
function csvRow(line) {   // 따옴표 친 칸까지 나누기(재무부 CSV 머리글)
  const out = []; let cur = "", q = false;
  for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; }
  out.push(cur); return out;
}
async function ust(col, start) {
  const y0 = +start.slice(0, 4), y1 = new Date().getUTCFullYear(), years = [];
  for (let y = y0; y <= y1; y++) years.push(y);
  const texts = await Promise.all(years.map((y) => get(`https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`, 0)));
  const out = [];
  texts.forEach((t) => {
    const lines = t.trim().split(/\r?\n/), j = csvRow(lines[0]).indexOf(col);
    if (j < 0) return;
    for (let i = 1; i < lines.length; i++) {
      const f = csvRow(lines[i]), v = num(f[j]), m = /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(f[0]);
      if (m && v !== null) out.push([`${m[3]}-${m[1]}-${m[2]}`, v]);
    }
  });
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
async function boj(code, start) {
  const out = [];
  let pos = "";
  for (let k = 0; k < 6; k++) {
    const j = JSON.parse(await get(`https://www.stat-search.boj.or.jp/api/v1/getDataCode?format=json&lang=en&db=FM01&code=${code}&startDate=${start.slice(0, 4)}${start.slice(5, 7)}${pos ? "&startPosition=" + pos : ""}`, 3600, "application/json"));
    const V = j.RESULTSET && j.RESULTSET[0] && j.RESULTSET[0].VALUES;
    if (V) V.SURVEY_DATES.forEach((d, i) => { const v = V.VALUES[i]; if (v !== null && v !== undefined) { const s = String(d); out.push([`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, +v]); } });
    if (!j.NEXTPOSITION) break;
    pos = j.NEXTPOSITION;
  }
  return out;
}
async function mof(col) {
  const base = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/";
  const [all, cur] = await Promise.all([get(base + "historical/jgbcme_all.csv", 12 * 3600), get(base + "jgbcme.csv", 3600)]);
  const seen = new Map();
  [all, cur].forEach((t) => {
    const lines = t.trim().split(/\r?\n/), hi = lines.findIndex((l) => l.startsWith("Date,"));
    if (hi < 0) return;
    const j = lines[hi].split(",").indexOf(col);
    for (let i = hi + 1; i < lines.length; i++) {
      const f = lines[i].split(","), m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(f[0]), v = num(f[j]);
      if (m && v !== null) seen.set(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`, v);
    }
  });
  return [...seen].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
async function ecb(key, start) {
  const lines = (await get(`https://data-api.ecb.europa.eu/service/data/FM/${key}?startPeriod=${start}&format=csvdata&detail=dataonly`, 3600, "text/csv")).trim().split(/\r?\n/);
  const h = lines[0].split(","), jd = h.indexOf("TIME_PERIOD"), jv = h.indexOf("OBS_VALUE"), out = [];
  for (let i = 1; i < lines.length; i++) { const f = lines[i].split(","), v = num(f[jv]); if (v !== null && !isWeekend(f[jd])) out.push([f[jd], v]); }
  return out;
}
async function bbk(code, start) {
  const t = await get(`https://api.statistiken.bundesbank.de/rest/data/BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.${code}.R.A.A._Z._Z.A?startPeriod=${start}&format=csv`, 3600, "text/csv"), out = [];
  t.split(/\r?\n/).forEach((l) => { const f = l.split(";"); if (/^\d{4}-\d\d-\d\d$/.test(f[0])) { const v = num(f[1]); if (v !== null) out.push([f[0], v]); } });
  return out;
}
const MON = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
async function boe(code, start) {
  // 영란은행은 시작일에 따라 500 을 내는 경우가 있어(예: 10y 국채 31/Oct/2016) 그해 1월 1일, 그 전해 1월 1일로 다시 시도한다(남는 앞부분은 나중에 잘림)
  const d = new Date(start + "T00:00:00Z"), y = d.getUTCFullYear();
  const froms = [`${String(d.getUTCDate()).padStart(2, "0")}/${Object.keys(MON)[d.getUTCMonth()]}/${y}`, `01/Jan/${y}`, `01/Jan/${y - 1}`];
  let t, err;
  for (const from of froms) {
    if (err) await new Promise((r) => setTimeout(r, 700));   // 영란은행 500 은 잠깐 뒤엔 대개 풀림
    try { t = await get(`https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=${from}&Dateto=now&SeriesCodes=${code}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`, 0, "text/csv"); break; } catch (e) { err = e; }
  }
  if (!t) throw err;
  const out = [];
  t.split(/\r?\n/).forEach((l) => { const m = /^(\d\d) (\w{3}) (\d{4}),([-\d.]+)/.exec(l); if (m && MON[m[2]] && !isWeekend(`${m[3]}-${MON[m[2]]}-${m[1]}`)) out.push([`${m[3]}-${MON[m[2]]}-${m[1]}`, +m[4]]); });
  return out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

async function series(id, start, today) {
  const d = S[id];
  if (d.kr) return kr(d.kr);
  if (d.ny) return ny(d.ny, start, today);
  if (d.ust) return ust(d.ust, start);
  if (d.boj) return boj(d.boj, start);
  if (d.mof) return mof(d.mof);
  if (d.ecb) return ecb(d.ecb, start);
  if (d.bbk) return bbk(d.bbk, start);
  if (d.boe) return boe(d.boe, start);
  // 금리차: 앞 계열 날짜마다, 뒤 계열의 그날 값(없으면 7일 이내 최근 값)을 뺀다
  const [a, b] = await Promise.all(d.diff.map((x) => series(x, start, today)));
  const out = []; let j = 0, bv = null, bd = "";
  for (const [day, v] of a) {
    while (j < b.length && b[j][0] <= day) { bv = b[j][1]; bd = b[j][0]; j++; }
    if (bv !== null && (Date.parse(day) - Date.parse(bd)) <= 7 * 86400e3) out.push([day, Math.round((v - bv) * 1000) / 1000]);
  }
  return out;
}

async function build(s, r) {
  const now = new Date(Date.now() + 9 * 3600e3), today = ymd(now), start = ymd(new Date(now - RANGE[r] * 86400e3));
  const pts = (await series(s, start, today)).filter((p) => p[0] >= start);
  if (!pts.length) throw new Error("빈 자료");
  return { s, r, bucket: 86400, updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16), last: pts[pts.length - 1][0],
    t: pts.map((p) => Date.parse(p[0] + "T00:00:00Z") / 1000), c: pts.map((p) => p[1]) };
}

export const onRequestGet = (ctx) => {
  const u = new URL(ctx.request.url), s = u.searchParams.get("s"), r = u.searchParams.get("r");
  if (!S[s] || !RANGE[r]) return new Response("Not Found", { status: 404 });
  return cached(ctx, `macro-v3-${s}-${r}`, 1800, () => build(s, r), 1800 * 6);
};
export const onRequestOptions = options;
