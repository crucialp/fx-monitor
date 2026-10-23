// 환율 관련 뉴스: 연합인포맥스·연합뉴스 RSS + 빙 뉴스 검색. 제목·링크·출처·시각만. 2분 캐시.
// 빙 뉴스의 pubDate 는 기사마다 2시간 늦거나 7시간 이르거나 제각각이라(2026-10-23 확인) 쓰지 않고,
// 기사 페이지에 적힌 입력 시각을 한 번 읽어 저장해 쓴다. 시각을 확인 못 한 검색 기사는 보여 주지 않는다.
// 분류(키워드 규칙): 긴급 = 속보·개입 등 + 환율/영향 요인, 외환 = 외환시장 기사, 영향 = 환율을 움직일 재료.
import { cached, kstNow, options } from "../../lib/common.js";

const FEEDS = [
  ["연합인포맥스", "https://news.einfomax.co.kr/rss/allArticle.xml"],
  ["연합인포맥스", "https://news.einfomax.co.kr/rss/S1N16.xml"],
  ["연합인포맥스", "https://news.einfomax.co.kr/rss/S1N9.xml"],
  ["연합뉴스", "https://www.yna.co.kr/rss/economy.xml"],
  ["연합뉴스", "https://www.yna.co.kr/rss/market.xml"],
];
// 검색 출처: 빙 뉴스 RSS (구글 뉴스는 클라우드 서버 요청을 막음)
const BING = ["달러-원 환율", "외환-마감 OR 외환-오전 OR 외환-개장", "원·달러 환율 마감", "외환당국 OR 환율 속보", "서울 외환시장"];
const GOOGLE = [
  '"외환-마감" OR "외환-오전" OR "외환-개장" OR "외환-오후" when:7d',
  "site:kbthink.com 외환 when:3d",
  "달러-원 OR 원·달러 OR 원달러 환율 when:2d",
  "환율 속보 OR 외환당국 OR 스무딩 when:3d",
];

const FX = /\[외환|\[서환|외환\]|외환-|달러-원|달러\/원|원\/달러|원·달러|원-달러|원달러|환율|NDF|역외|외환당국|외환시장|외환보유|원화|달러인덱스|DXY|위안|엔화|엔-달러|달러-엔|환헤지|스와프/;
const URGENT = /속보|긴급|\(1보\)|1보\]|개입|스무딩|패닉|쇼크|폭락|폭등|서킷브레이커|사이드카|비상/;
const SHARP = /급등|급락|급반등|출렁/;
const DRIVER = /연준|FOMC|파월|Fed|美 ?금리|미국 금리|기준금리|금통위|한은|한국은행|총재|CPI|PCE|물가|고용|비농업|관세|트럼프|국민연금|외국인 순매|외국인 매도|수출|무역수지|경상수지|유가|원유|이란|중동|이스라엘|우크라|러시아|BOJ|일본은행|인민은행|국채 ?금리|10년물|국채|코스피 급|증시 급|신용등급|무디스/;

function classify(t) {
  const fx = FX.test(t), ur = URGENT.test(t), dr = DRIVER.test(t);
  if ((ur && (fx || dr)) || (fx && SHARP.test(t))) return "긴급";
  if (fx) return "외환";
  if (dr) return "영향";
  return null;
}

function unesc(s) {
  return s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&middot;/g, "·").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/<[^>]+>/g, "").trim();
}

function when(raw) {
  if (!raw) return null;
  raw = raw.trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/); // 인포맥스: 한국 시간
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] - 9, +m[5]);
  const t = Date.parse(raw);
  return isNaN(t) ? null : t;
}

function* items(xml) {
  for (const it of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const x = it[1];
    const t = x.match(/<title>([\s\S]*?)<\/title>/), l = x.match(/<link>([\s\S]*?)<\/link>/), d = x.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const src = x.match(/<News:Source>([\s\S]*?)<\/News:Source>/i);
    if (t && l) yield [unesc(t[1]), unesc(l[1]), when(d && d[1]), src ? unesc(src[1]) : null];
  }
}

const STATS = [];
async function get(url, label) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "accept-language": "ko-KR,ko;q=0.9" }, signal: AbortSignal.timeout(5000) });
    const text = r.ok ? await r.text() : "";
    STATS.push({ src: label, http: r.status, items: (text.match(/<item>/g) || []).length });
    return text;
  } catch (e) { STATS.push({ src: label, http: 0, err: String(e).slice(0, 80) }); return ""; }
}

const norm = (t) => t.replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 60);

// 빙 링크(apiclick.aspx?...&url=원래주소)에서 언론사 주소를 꺼낸다
function realUrl(l) {
  try { const u = new URL(l); return /bing\.com$/.test(u.hostname) && u.searchParams.get("url") ? u.searchParams.get("url") : l; } catch { return l; }
}
// 기사 페이지의 입력 시각: 메타 태그·JSON-LD·네이버·'입력 2026.10.22 18:06' 순으로 찾는다. 시간대가 없으면 한국 시간.
const PT = [
  /property="article:published_time"\s+content="([^"]+)"/, /content="([^"]+)"\s+property="article:published_time"/,
  /"datePublished"\s*:\s*"([^"]+)"/, /data-date-time="([^"]+)"/, /property="og:regDate"\s+content="([^"]+)"/,
  /property="dable:published_time"\s+content="([^"]+)"/, /name="pubdate"\s+content="([^"]+)"/, /itemprop="datePublished"\s+content="([^"]+)"/,
  /(?:기사입력|입력|등록|승인)\s*:?\s*(20\d\d[.\-/]\s?\d{1,2}[.\-/]\s?\d{1,2}\.?\s+(?:오[전후]\s*)?\d{1,2}:\d{2})/,
];
function parsePT(raw) {
  raw = raw.trim();
  if (/^20\d\d-\d\d-\d\dT\d\d:\d\d/.test(raw) && /(Z|[+-]\d\d:?\d\d)$/.test(raw)) { const t = Date.parse(raw); return isNaN(t) ? null : t; }
  const m = raw.match(/(20\d\d)[.\-/]\s?(\d{1,2})[.\-/]\s?(\d{1,2})\.?[T\s]+(오[전후])?\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  let h = +m[5];
  if (m[4] === "오후" && h < 12) h += 12;
  if (m[4] === "오전" && h === 12) h = 0;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], h - 9, +m[6]);
}
// 기사별 입력 시각은 주소→[시각, 확인한 때] 하나의 묶음으로 엣지 캐시에 둔다(기사마다 따로 두면 캐시 호출만으로
// 요청당 외부 호출 한도 50회를 넘어 오류가 났음, 2026-10-23). 8일 지난 기사, 하루 지난 '못 찾음'은 지워서 다시 확인.
const PT_KEY = "https://cache.usdkrw.local/pt-map-v1";
async function loadPT() {
  try { const r = await caches.default.match(new Request(PT_KEY)); return r ? await r.json() : {}; } catch { return {}; }
}
function savePT(ctx, map) {
  const now = Date.now();
  for (const [u, [t, at]] of Object.entries(map)) if ((t && t < now - 8 * 86400e3) || (!t && at < now - 86400e3)) delete map[u];
  ctx.waitUntil(caches.default.put(new Request(PT_KEY), new Response(JSON.stringify(map), { headers: { "content-type": "application/json", "cache-control": "public, max-age=2592000" } })).catch(() => {}));
}
async function pageTime(url) {
  let t = null;
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36", "accept-language": "ko-KR,ko;q=0.9" }, signal: AbortSignal.timeout(5000) });
    const h = r.ok ? await r.text() : "";
    for (const p of PT) {
      const m = h.match(p); if (!m) continue;
      const v = parsePT(m[1]);
      // 날짜만 있는 값(한국 시간 00:00 정각)은 시각을 모르는 것으로 보고 다음 방법으로
      if (v && (v + 9 * 3600e3) % 86400e3 === 0) continue;
      if (v) { t = v; break; }
    }
  } catch {}
  return t && t <= Date.now() + 10 * 60000 ? t : null;
}

async function build(ctx) {
  const now = Date.now();
  STATS.length = 0;
  const direct = await Promise.all(FEEDS.map(([s, u]) => get(u, u.replace(/^https:\/\/(www\.)?/, "")).then((x) => [s, x])));
  const google = []; // 구글 뉴스는 Cloudflare 서버 요청을 503 으로 막아서(2026-10-22 확인) 쓰지 않는다
  const bing = await Promise.all(BING.map((q, i) => get("https://www.bing.com/news/search?" +
    new URLSearchParams({ q, format: "rss", setlang: "ko-KR", cc: "KR", qft: "sortbydate=\"1\"" }), "bing#" + i)));
  const keep = new Map();
  const add = (src, title, link, ts) => {
    const lv = classify(title);
    if (!lv) return;
    const k = norm(title);
    const old = keep.get(k);
    if (old) {
      if (/news\.google\.com|bing\.com/.test(old.u) && !/news\.google\.com|bing\.com/.test(link)) { old.u = link; old.s = src; }
      return;
    }
    keep.set(k, { t: title, u: link, s: src, m: Math.floor((ts || now) / 60000), lv });
  };
  for (const [src, xml] of direct) for (const [t, l, ts] of items(xml)) add(src, t, l, ts);
  // 빙 뉴스: 이미 RSS 로 받은 기사가 아니면 기사 페이지의 입력 시각을 확인해서만 넣는다.
  // 한 번에 여는 페이지 수는 요청당 외부 호출 한도(50회) 안에서 28개까지, 빙 표기 시각이 최근인 것부터. 나머지는 다음 갱신 때.
  const cand = new Map();
  for (const xml of bing) for (const [t, l, ts, src] of items(xml)) {
    if (!classify(t) || keep.has(norm(t)) || cand.has(norm(t))) continue;
    cand.set(norm(t), { t, u: realUrl(l), s: src || "빙 뉴스", hint: ts || 0 });
  }
  const list = [...cand.values()].sort((a, b) => b.hint - a.hint);
  const pt = await loadPT();
  const need = list.filter((c) => !(c.u in pt)).slice(0, 25);
  await Promise.all(need.map(async (c) => { pt[c.u] = [await pageTime(c.u), Date.now()]; }));
  if (need.length) savePT(ctx, pt);
  for (const c of list) { const e = pt[c.u]; if (e && e[0]) add(c.s.replace(/ on MSN$/, ""), c.t, c.u, e[0]); }
  for (const xml of google) for (const [t0, l, ts] of items(xml)) {
    const m = t0.match(/^(.*) - ([^-]+)$/);
    add(m ? m[2].trim() : "구글 뉴스", m ? m[1].trim() : t0, l, ts);
  }
  // 일시적으로 일부 출처가 실패해도 목록이 줄지 않도록 직전 성공본과 합친다(최근 7일)
  try {
    const last = await caches.default.match(new Request("https://cache.usdkrw.local/news-v5-last-good"));
    if (last) for (const v of (await last.json()).items || []) { const k = norm(v.t); if (!keep.has(k)) keep.set(k, v); }
  } catch {}
  const cut = Math.floor(now / 60000) - 7 * 1440;
  const out = [...keep.values()].filter((v) => v.m >= cut && v.m <= Math.floor(now / 60000) + 10).sort((a, b) => b.m - a.m).slice(0, 500);
  return { updated: kstNow().iso, sources: STATS.slice(), items: out };
}

export const onRequestGet = async (ctx) => {
  // 점검용: ?fresh=1 이면 캐시 없이 바로 만들어 결과나 오류를 그대로 보여 준다
  if (new URL(ctx.request.url).searchParams.get("fresh") === "1") {
    try { return new Response(JSON.stringify(await build(ctx)), { headers: { "content-type": "application/json; charset=utf-8" } }); }
    catch (e) { return new Response(JSON.stringify({ error: String(e && e.stack || e) }), { status: 500, headers: { "content-type": "application/json; charset=utf-8" } }); }
  }
  return cached(ctx, "news-v5", 120, () => build(ctx), 86400);
};
export const onRequestOptions = options;
