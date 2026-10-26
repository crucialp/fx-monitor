// ver2 뉴스: 공식 기관 발표 RSS 만 쓴다 — 제목·원문 링크·게시 시각만(본문·요약은 옮기지 않음).
//  - 한국은행: 홈페이지 정보는 직접 링크·심층 링크 방식으로 이용 가능(저작권보호방침), RSS 를 공식 제공
//  - 미 연준(Federal Reserve): 미국 연방정부 저작물(공공영역)
//  - ECB: 출처를 밝히면 재사용 허용
const FEEDS = [
  ["한국은행", "https://www.bok.or.kr/portal/bbs/B0000552/news.rss?menuNo=200690"],   // 보도자료(전체)
  ["한국은행", "https://www.bok.or.kr/portal/bbs/P0002575/news.rss?menuNo=200041"],   // 총재 연설·강연
  ["미 연준", "https://www.federalreserve.gov/feeds/press_all.xml"],
  ["ECB", "https://www.ecb.europa.eu/rss/press.html"],
];

const unesc = (s) => s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&middot;/g, "·").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

export async function fetchOfficial() {
  const stats = [];
  const lists = await Promise.all(FEEDS.map(async ([src, url]) => {
    try {
      const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }, cf: { cacheTtl: 120, cacheEverything: true }, signal: AbortSignal.timeout(6000) });
      const x = r.ok ? await r.text() : "";
      const out = [];
      for (const m of x.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
        const it = m[1];
        const t = it.match(/<title>([\s\S]*?)<\/title>/), l = it.match(/<link>([\s\S]*?)<\/link>/), d = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        const ts = d ? Date.parse(unesc(d[1])) : NaN;
        if (t && l && !isNaN(ts)) out.push({ t: unesc(t[1]), u: unesc(l[1]).replace("//press/", "/press/"), s: src, ts });
      }
      stats.push({ src: url.replace(/^https:\/\/(www\.)?/, "").slice(0, 60), http: r.status, items: out.length });
      return out;
    } catch (e) { stats.push({ src: url, http: 0, err: String(e).slice(0, 80) }); return []; }
  }));
  const seen = new Set(), items = [];
  for (const it of lists.flat()) { const k = it.t.replace(/\s+/g, ""); if (!seen.has(k)) { seen.add(k); items.push(it); } }
  items.sort((a, b) => b.ts - a.ts);
  return { items, stats };
}

// ---- 환율 쪽 분류(긴급·외환·영향): 금리 결정·통화정책 → 긴급, 외환·국제수지 → 외환, 물가·경기·금융안정 등 → 영향
const URGENT = /통화정책방향|기준금리|금융통화위원회|FOMC statement|monetary policy decision|policy rate|key ECB interest rates|interest rate decision/i;
const FXW = /외환|환율|국제수지|외환보유|외화|foreign exchange|exchange rate|swap line|dollar liquidity|currenc/i;
const DRV = /물가|금리|통화|경제전망|경제상황|국내총생산|GDP|성장|수출|무역|금융안정|가계|대출|총재|FOMC|monetary|inflation|rate|minutes|balance sheet|discount|financial stability|Powell|Lagarde|Consumer Expectations|projections|economic outlook/i;
export function classifyFx(t) {
  if (URGENT.test(t)) return "긴급";
  if (FXW.test(t)) return "외환";
  if (DRV.test(t)) return "영향";
  return null;
}

// ---- 금리 쪽 태그(금리 모니터 fetch_news.py 의 TAGS 와 같은 갈래, 영문은 해외 중앙은행)
const TAGS = [
  ["통화정책", /기준금리|금통위|금융통화위원회|통화정책|금리\s?(인하|인상|동결|결정)|의결|FOMC|monetary policy|policy rate|interest rate/i],
  ["국고채·시장", /국고채|국채|채권|수익률|지표금리|Treasury|yield/i],
  ["크레딧", /회사채|크레딧|신용|스프레드|credit/i],
  ["단기금융", /\bCD\b|콜금리|통안|단기자금|MMF|\bRP\b|레포|KOFR|코리보|repo|discount rate/i],
  ["예금·대출", /대출|예금|가계|주담대|lending|loan/i],
];
const RELEVANT = /금리|채권|국채|국고채|통화정책|금통위|금융통화위원회|의결|대출|예금|지표금리|금융안정|물가|FOMC|monetary|rate|Treasury|yield|inflation|minutes|financial stability|discount/i;
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, "0"); }
export function toRateItems(items) {
  const kst = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 16) + "+09:00";
  return items.filter((it) => RELEVANT.test(it.t)).map((it) => {
    const g = TAGS.filter(([, re]) => re.test(it.t)).map(([n]) => n);
    if (it.s !== "한국은행") g.push("해외금리");
    return { id: hash(it.t), t: it.t, u: it.u, s: it.s, p: kst(it.ts), d: "", g: g.length ? [...new Set(g)] : ["기타"], v: "rss", f: kst(it.ts) };
  });
}
