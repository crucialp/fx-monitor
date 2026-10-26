// 환율 관련 뉴스: 연합뉴스 RSS(전체·경제·마켓+)만. 제목·링크·시각만 보여 주고 요약·본문은 옮기지 않는다. 2분 캐시.
// 연합뉴스는 '비상업적 블로그와 개인적인 용도'의 RSS 이용을 허용한다(https://www.yna.co.kr/rss/index, 2026-10-26 확인).
// 이 사이트는 광고 없는 비상업 운영. 빙·구글 뉴스 RSS(개인 RSS 리더 밖 사용 금지), 연합인포맥스(영리·복제 금지),
// 네이버(자동 수집 금지)는 쓰지 않는다.
// 분류(키워드 규칙): 긴급 = 속보·개입 등 + 환율/영향 요인, 외환 = 외환시장 기사, 영향 = 환율을 움직일 재료.
import { cached, kstNow, options } from "../../lib/common.js";

const FEEDS = [
  "https://www.yna.co.kr/rss/news.xml",
  "https://www.yna.co.kr/rss/economy.xml",
  "https://www.yna.co.kr/rss/market.xml",
];

const FX = /\[외환|\[서환|외환\]|외환-|달러-원|달러\/원|원\/달러|원·달러|원-달러|원달러|환율|NDF|역외|외환당국|외환시장|외환보유|원화|달러인덱스|DXY|위안|엔화|엔-달러|달러-엔|환헤지|스와프/;
const URGENT = /속보|긴급|\(1보\)|1보\]|개입|스무딩|패닉|쇼크|폭락|폭등|서킷브레이커|사이드카|비상/;
const SHARP = /급등|급락|급반등|출렁/;
// 영향 요인: 경제 재료는 그대로, 증시는 급등락일 때만, 정치·지정학(트럼프·중동 등)은 경제 낱말이 같이 있을 때만,
// 수출은 증감 기사일 때만(전체 피드의 일반 기사를 거르려고).
const DRIVER = /연준|FOMC|파월|Fed|美 ?금리|미국 금리|기준금리|금통위|한은|한국은행|신현송|CPI|PCE|소비자물가|물가 ?상승|고용지표|비농업|실업률|관세|국민연금|외국인 순매|외국인 매도|무역수지|경상수지|유가|원유|BOJ|일본은행|인민은행|국채 ?금리|10년물|국고채|신용등급|무디스|피치/;
const STOCK = /(코스피|코스닥|증시|주가|뉴욕증시|나스닥).{0,12}(급락|급등|폭락|폭등|패닉|서킷|사이드카)|(급락|급등|폭락|폭등).{0,8}(코스피|코스닥|증시)/;
const GEO = /트럼프|이란|중동|이스라엘|우크라|러시아|중국/;
const ECON = /관세|유가|원유|금리|환율|증시|주가|무역|물가|경제|달러/;
const EXPORT = /수출.{0,10}(증가|감소|급증|급감|%|억 ?달러|실적|호조|부진)|수출액/;

function classify(t) {
  if (/^\[(표|게시판|인사|부고|포토|그래픽)\]/.test(t)) return null;   // 표·게시판 같은 정기 알림은 뺌
  const fx = FX.test(t), ur = URGENT.test(t), dr = DRIVER.test(t) || STOCK.test(t) || EXPORT.test(t) || (GEO.test(t) && ECON.test(t));
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

function* items(xml) {
  for (const it of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const x = it[1];
    const t = x.match(/<title>([\s\S]*?)<\/title>/), l = x.match(/<link>([\s\S]*?)<\/link>/), d = x.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const ts = d ? Date.parse(unesc(d[1])) : NaN;   // 연합뉴스 pubDate 는 기사 송고 시각과 같음(2026-10-22 기사 페이지와 대조)
    if (t && l && !isNaN(ts)) yield [unesc(t[1]), unesc(l[1]), ts];
  }
}

const STATS = [];
async function get(url) {
  const label = url.replace(/^https:\/\/www\./, "");
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "accept-language": "ko-KR,ko;q=0.9" }, signal: AbortSignal.timeout(5000) });
    const text = r.ok ? await r.text() : "";
    STATS.push({ src: label, http: r.status, items: (text.match(/<item>/g) || []).length });
    return text;
  } catch (e) { STATS.push({ src: label, http: 0, err: String(e).slice(0, 80) }); return ""; }
}

const norm = (t) => t.replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 60);

async function build() {
  const now = Date.now();
  STATS.length = 0;
  const xmls = await Promise.all(FEEDS.map(get));
  const keep = new Map();
  for (const xml of xmls) for (const [title, link, ts] of items(xml)) {
    const lv = classify(title);
    if (!lv) continue;
    const k = norm(title);
    if (!keep.has(k)) keep.set(k, { t: title, u: link, s: "연합뉴스", m: Math.floor(ts / 60000), lv });
  }
  // 피드에는 최근 기사만 있으므로 직전 성공본과 합쳐 7일치를 유지(일시적인 실패에도 목록이 줄지 않게)
  try {
    const last = await caches.default.match(new Request("https://cache.usdkrw.local/news-v6-last-good"));
    if (last) for (const v of (await last.json()).items || []) { const k = norm(v.t); if (!keep.has(k)) keep.set(k, v); }
  } catch {}
  const cut = Math.floor(now / 60000) - 7 * 1440;
  const out = [...keep.values()].filter((v) => v.m >= cut && v.m <= Math.floor(now / 60000) + 10).sort((a, b) => b.m - a.m).slice(0, 500);
  return { updated: kstNow().iso, source: "연합뉴스 RSS", sources: STATS.slice(), items: out };
}

export const onRequestGet = async (ctx) => {
  // 점검용: ?fresh=1 이면 캐시 없이 바로 만들어 결과나 오류를 그대로 보여 준다
  if (new URL(ctx.request.url).searchParams.get("fresh") === "1") {
    try { return new Response(JSON.stringify(await build()), { headers: { "content-type": "application/json; charset=utf-8" } }); }
    catch (e) { return new Response(JSON.stringify({ error: String(e && e.stack || e) }), { status: 500, headers: { "content-type": "application/json; charset=utf-8" } }); }
  }
  return cached(ctx, "news-v6", 120, build, 86400);
};
export const onRequestOptions = options;
