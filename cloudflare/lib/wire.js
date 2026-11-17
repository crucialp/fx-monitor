// 외신 속보: 해외 매체 RSS 제목(최근 8시간)을 정해 둔 영어 낱말 규칙으로 '무슨 소식인지·달러/원(또는 국고채 금리)을 올리는 쪽인지' 분류한다.
// 사용자 요청: 브리핑 요인 목록에 번호 뒤 "(외신)"을 붙여 해외 속보·찌라시도 보이게. 소식통·보도 인용이면 '미확인'을 덧붙인다.
// 제목·링크·시각만 쓰고 본문은 가져오지 않는다. 비상업 본 사이트 브리핑(/api/brief)에서만 쓴다(ver2 에는 없음).
//  FinancialJuice(실시간 속보 헤드라인) · investingLive(옛 ForexLive, 외환 속보) · FXStreet · Bloomberg(시장·경제)

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
export const FEEDS = [
  ["FinancialJuice", "https://www.financialjuice.com/feed.ashx?xy=rss"],
  ["investingLive", "https://investinglive.com/feed/"],
  ["FXStreet", "https://www.fxstreet.com/rss/news"],
  ["Bloomberg", "https://feeds.bloomberg.com/markets/news.rss"],
  ["Bloomberg", "https://feeds.bloomberg.com/economics/news.rss"],
];
export const WIRE_SRC = "외신 제목(FinancialJuice·investingLive·FXStreet·Bloomberg RSS)";

const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const unent = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
const tag = (it, n) => { const m = it.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`, "i")); return m ? unent(m[1].replace(/<!\[CDATA\[|\]\]>/g, "")).trim() : ""; };

// RSS 글자 → [{t 제목, u 링크, s 매체, m 발행 시각(ms)}]
export function parseRss(xml, src) {
  const out = [];
  for (const it of String(xml).match(/<item[\s>][\s\S]*?<\/item>/gi) || []) {
    const t = tag(it, "title").replace(/^FinancialJuice:\s*/i, "").replace(/\s+/g, " "), u = tag(it, "link"), m = Date.parse(tag(it, "pubDate"));
    if (t && /^https?:\/\//.test(u) && Number.isFinite(m)) out.push({ t, u, s: src, m });
  }
  return out;
}

async function getFeed([src, url]) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`${src} ${r.status}`);
  return parseRss(await r.text(), src);
}

// 모든 피드(3분 엣지 캐시: 환율·금리 브리핑이 같이 씀). 하나가 실패해도 나머지로
export async function wireItems() {
  const cache = caches.default, key = new Request("https://cache.usdkrw.local/wire-v1");
  const hit = await cache.match(key);
  if (hit) return hit.json();
  const got = await Promise.all(FEEDS.map((f) => getFeed(f).catch(() => [])));
  const items = got.flat();
  if (items.length) await cache.put(key, new Response(JSON.stringify(items), { headers: { "content-type": "application/json", "cache-control": "public, max-age=180" } }));
  return items;
}

// ---------------- 분류 규칙. fx: 달러/원을 올리는 쪽 +1(원화 약세), kr: 국고채 3년 금리를 올리는 쪽 +1, 0 = 그 브리핑에선 안 씀
const UP = "(?:rise[sn]?|rising|rose|climb(?:s|ed|ing)?|jump(?:s|ed)?|surg(?:e|es|ed|ing)|spik(?:e|es|ed)|soar(?:s|ed)?|rall(?:y|ies|ied)|gain(?:s|ed)?|firm(?:s|er|ed)?|strengthen(?:s|ed)?|higher|advanc(?:e|es|ed)|extends? gains|(?:hits?|at|near|to) (?:a |an |its |fresh |new )?(?:[\\w-]+ )?(?:highs?|peaks?|strongest(?: level)?))";
const DOWN = "(?:fall(?:s|ing)?|fell|drop(?:s|ped)?|slid(?:e|es)?|slip(?:s|ped)?|declin(?:e|es|ed)|weaken(?:s|ed)?|lower|retreat(?:s|ed)?|eas(?:e|es|ed)|tumbl(?:e|es|ed)|plung(?:e|es|ed)|sink(?:s)?|sank|slump(?:s|ed)?|extends? losses|(?:hits?|at|near|to) (?:a |an |its |fresh |new )?(?:[\\w-]+ )?(?:lows?|weakest(?: level)?))";
// 주어 뒤 35자 안의 동사(문장 부호에서 끊되 숫자 속 '.'은 건너뜀)
const near = (subj, verbs) => new RegExp(`(?:${subj})(?:[^.;:!?]|\\.(?=\\d)){0,35}?\\b${verbs}\\b`, "i");
const FOREIGN = /\b(uk|u\.k\.|britain|british|japan(?:ese)?|tokyo|australia(?:n)?|rba|canad(?:a|ian)|euro ?zone|ecb|german(?:y)?|france|french|china|chinese|new zealand|rbnz|swiss|switzerland|india(?:n)?|brazil|mexic(?:o|an)|turk(?:ey|ish)|israel|norw(?:ay|egian)|swed(?:en|ish)|spain|spanish|ital(?:y|ian)|korea(?:n)?|taiwan|bank of england|boe)\b/i;
// "Nigerian Inflation" 처럼 나라 형용사가 붙은 지표(미국 제외)
const NATADJ = /\b(?!American\b)[A-Z][a-z]+(?:ian|ese|ish|ean|i)\s+(?:[Ii]nflation|CPI|[Cc]onsumer [Pp]rices|GDP|[Ee]conomy|[Jj]obs|[Uu]nemployment|[Pp]ayrolls|[Ee]xports)/;
const OTHER_DOLLAR = /\b(australian|aussie|new zealand|nz|kiwi|canadian|loonie|singapore|taiwan(?:ese)?|hong kong)\s+dollars?\b/gi;
const HAWK = "(?:hikes?|hiking|hiked|raise rates|raising rates|rate (?:increases?|rises?|rising)|increas(?:e|ing) rates|rates? (?:to )?rise|rise in rates|tighten(?:ing)?|tighter policy|hawkish|higher for longer|more restricti(?:on|ve)|get to restrictive|higher (?:market )?borrowing costs)";
const DOVE = "(?:cuts?|cutting|easing|ease policy|dovish|lower rates|rate reductions?)";
// "hike bets fade" 처럼 기대가 꺾였다는 말(쉼표 너머 다른 구절의 'falling oil' 등은 안 봄)
const BETS_FADE = "[^.,;]{0,25}\\b(?:bets|odds|expectations|hopes|pricing)\\b[^.,;]{0,15}\\b(?:fade[sd]?|pared|eas(?:e|es|ed)|recede[sd]?|dwindl\\w*|cool(?:s|ed)?|slip(?:s|ped)?|falls?|fell|drop(?:s|ped)?)\\b";
function policy(h, subj) {
  if (!new RegExp(subj, "i").test(h)) return 0;
  if (new RegExp(`(?:cut|easing)${BETS_FADE}|no (?:rush|hurry|need) to cut|against (?:a |more |further )?(?:rate )?cuts?|hard to (?:support|justify)[^.]{0,20}cut|skeptic\\w*[^.]{0,20}cut|oppose[sd]? (?:a |more )?(?:rate )?cuts?`, "i").test(h)) return 1;
  if (new RegExp(`(?:hike|tighten\\w*)${BETS_FADE}|hawkish[^.]{0,20}(?:worries|fears|bets|concerns|outlook)[^.]{0,10}(?:ebbs?|fade[sd]?|eas(?:e|es|ed)|recede[sd]?)|against (?:a |more )?(?:rate )?hikes?|no (?:rush|need) to (?:hike|raise)|oppose[sd]? (?:a )?(?:rate )?hikes?|pause (?:in |on )?(?:rate )?hikes|skip (?:a )?hike|end (?:of |to )?(?:rate )?hikes|stop hiking`, "i").test(h)) return -1;
  if (new RegExp(`\\b${HAWK}\\b`, "i").test(h)) return 1;
  if (new RegExp(`\\b${DOVE}\\b`, "i").test(h)) return -1;
  return 0;
}
const dir = (h, subj) => (near(subj, UP).test(h) ? 1 : near(subj, DOWN).test(h) ? -1 : 0);
const FED = "\\bfed\\b|fed's|\\bfomc\\b|federal reserve|powell|warsh|waller|bowman|jefferson|logan|hammack|kashkari|musalem|schmid|goolsbee|bostic|daly|barkin|miran";
const BOK = "bank of korea|\\bbok\\b|korea(?:n)? central bank|governor rhee|rhee chang";
const BOJ = "\\bboj\\b|bank of japan|ueda|kuroda|himino|uchida";
const ECB = "\\becb\\b|european central bank|lagarde|schnabel|nagel|villeroy|de guindos|holzmann|kazaks";

// 제목 하나 → {cat, w(무게), fx, kr, ko(한국어 요약)} 또는 null. 위에서부터 먼저 맞는 규칙 하나만
function classify(title) {
  const h = String(title).replace(/\bU\.S\./g, "US");
  let d;
  // 한국
  if (/north korea|pyongyang|\bdprk\b/i.test(h) && /missile|launch|nuclear|provocat|artillery|attack|fire[sd]?\b/i.test(h)) return { cat: "nk", w: 0.8, fx: 1, kr: 0, ko: "북한 도발 소식" };
  if (/wgbi|world government bond index|ftse russell/i.test(h) && /korea/i.test(h)) return { cat: "wgbi", w: 0.9, fx: -1, kr: -1, ko: "세계국채지수(WGBI) 관련 자금 유입 기대" };
  if ((d = policy(h, BOK))) return { cat: "bok", w: 0.95, fx: -d, kr: d, ko: d > 0 ? "한국은행 긴축(인상) 쪽 신호" : "한국은행 완화(인하) 쪽 신호" };
  if (/korea|seoul|\bkrw\b/i.test(h) && /interven|smoothing|verbal|warn|stabili[sz]|fx swap|\bnps\b|national pension|currency swap|excessive/i.test(h) && /won|currency|\bfx\b|forex|exchange rate|krw/i.test(h))
    return { cat: "krfx", w: 1, fx: -1, kr: 0, ko: "한국 외환당국 시장 안정 조치·경고" };
  if ((d = dir(h, "usd\\/krw|dollar[- /]won"))) return { cat: "won", w: 1, fx: d, kr: 0, ko: d > 0 ? "달러/원 상승 보도" : "달러/원 하락 보도" };
  if (/korea|\bkrw\b/i.test(h) && (d = dir(h, "\\bwon\\b|\\bkrw\\b"))) return { cat: "won", w: 1, fx: -d, kr: 0, ko: d > 0 ? "원화 강세 보도" : "원화 약세 보도" };
  if ((d = dir(h, "(?:south )?korea(?:'s|n)? (?:\\w+ )?exports?"))) return { cat: "krexp", w: 0.8, fx: -d, kr: 0, ko: d > 0 ? "한국 수출 호조" : "한국 수출 부진" };
  // 미국 통화정책·지표·금리
  if ((d = policy(h, FED))) return { cat: "fed", w: 0.95, fx: d, kr: d, ko: d > 0 ? "연준 금리 인상(긴축) 쪽 신호" : "연준 금리 인하(완화) 쪽 신호" };
  if (!FOREIGN.test(h) && !NATADJ.test(h)) {
    // 지표 발표 속보: "Actual 0.4% (Forecast 0.3%..." · "3.1% vs 3.2% expected" → 예상보다 높으면 매파(달러·금리 올리는 쪽)
    const AF = h.match(/actual[:\s]+(-?\d+(?:\.\d+)?\s*[%kKmMbB]?)\s*\(?\s*(?:forecast|f'cast|exp(?:ected)?|est(?:imate)?|consensus)[:\s]+(-?\d+(?:\.\d+)?\s*[%kKmMbB]?)/i)
      || h.match(/(-?\d+(?:\.\d+)?\s*[%kKmMbB]?)\s+vs\.?\s+\+?(-?\d+(?:\.\d+)?\s*[%kKmMbB]?)\s*(?:expected|exp\b\.?|est\b\.?|estimates?|consensus|forecast|f'cast)/i);
    if (AF) { AF[1] = AF[1].replace(/\s+/g, ""); AF[2] = AF[2].replace(/\s+/g, ""); }
    if (AF && parseFloat(AF[1]) !== parseFloat(AF[2])) {
      const KIND = [[/\bcpi\b|consumer price/i, "소비자물가", 1], [/\bpce\b/i, "PCE 물가", 1], [/\bppi\b|producer price/i, "생산자물가", 1], [/inflation/i, "물가", 1],
        [/payrolls|nonfarm|\bnfp\b|employment change|\badp\b/i, "고용", 1], [/jobless|claims/i, "실업수당 청구", -1], [/unemployment/i, "실업률", -1],
        [/\bgdp\b/i, "GDP", 1], [/retail sales/i, "소매판매", 1], [/\bism\b|\bpmi\b/i, "PMI", 1], [/durable/i, "내구재 주문", 1]];
      const k = KIND.find(([re]) => re.test(h));
      if (k) {
        const hi = parseFloat(AF[1]) > parseFloat(AF[2]), hawk = (hi ? 1 : -1) * k[2];
        return { cat: "data", w: 0.9, fx: hawk, kr: hawk, ko: `미국 ${k[1]} 예상 ${hi ? "상회" : "하회"}(${AF[1]}, 예상 ${AF[2]})` };
      }
    }
    const HOT = "(?:hotter|(?:higher|more) than expected|above (?:expectations|forecasts?|estimates)|beats?|tops?|accelerat\\w*|jumps?|surges?|rises? more|heats? up|broaden\\w*|sticky)";
    const COOL = "(?:cool(?:s|er|ed|ing)?|softer|slow(?:s|ed|er)?|below (?:expectations|forecasts?|estimates)|(?:lower|less) than expected|eas(?:e|es|ed)|miss(?:es|ed)?|decelerat\\w*)";
    const INF = "inflation|\\bcpi\\b|\\bpce\\b|\\bppi\\b|core prices|consumer prices";
    if (near(INF, HOT).test(h)) return { cat: "data", w: 0.9, fx: 1, kr: 1, ko: "미국 물가 예상보다 높음" };
    if (near(INF, COOL).test(h)) return { cat: "data", w: 0.9, fx: -1, kr: -1, ko: "미국 물가 둔화" };
    const JOB = "payrolls|nonfarm|jobs report|\\bjobs\\b|job growth|hiring|employment(?! rate)";
    if (near(JOB, "(?:beats?|tops?|surges?|jumps?|strong(?:er)?|robust|above|(?:more|better|stronger) than expected)").test(h)) return { cat: "data", w: 0.9, fx: 1, kr: 1, ko: "미국 고용 강함" };
    if (near(JOB, "(?:miss(?:es|ed)?|weak(?:er)?|slump(?:s|ed)?|falls?|declines?|below|cool(?:s|ed)?|slow(?:s|ed)?)").test(h)) return { cat: "data", w: 0.9, fx: -1, kr: -1, ko: "미국 고용 약함" };
    if ((d = dir(h, "unemployment(?: rate)?|jobless (?:claims|rate)"))) return { cat: "data", w: 0.85, fx: -d, kr: -d, ko: d > 0 ? "미국 실업 지표 악화" : "미국 실업 지표 개선" };
    if (/\b(?:rising|higher|surging|climbing|soaring|jumping)\s+(?:US\s+)?(?:treasury\s+|bond\s+)?yields\b/i.test(h)) return { cat: "ust", w: 0.85, fx: 1, kr: 1, ko: "미 국채 금리 상승" };
    if (/\b(?:falling|lower|sliding|declining|tumbling|retreating)\s+(?:US\s+)?(?:treasury\s+|bond\s+)?yields\b/i.test(h)) return { cat: "ust", w: 0.85, fx: -1, kr: -1, ko: "미 국채 금리 하락" };
    if ((d = dir(h, "treasury yields?|treasuries yields?|\\bus yields?|u\\.s\\. yields?|(?:2|10|30)-year (?:treasury )?yields?|(?:two|ten)-year (?:treasury )?yields?|bond yields?|\\byields?\\b")))
      return { cat: "ust", w: 0.85, fx: d, kr: d, ko: d > 0 ? "미 국채 금리 상승" : "미 국채 금리 하락" };
    if (!/yield/i.test(h)) {
      if (/\btreasuries\b[^.;:]{0,30}\b(?:rall(?:y|ies|ied)|gain(?:s|ed)?|advance[sd]?)\b/i.test(h)) return { cat: "ust", w: 0.85, fx: -1, kr: -1, ko: "미 국채 강세(금리 하락)" };
      if (/\b(?:treasur(?:y|ies)|bonds?)\b[^.;:]{0,15}\b(?:sell-?off|rout|slump(?:s|ed)?|tumbl(?:e|es|ed))\b/i.test(h)) return { cat: "ust", w: 0.85, fx: 1, kr: 1, ko: "미 국채 약세(금리 상승)" };
    }
  }
  // 일본·중국·유럽
  if ((d = policy(h, BOJ))) return { cat: "boj", w: 0.8, fx: -d, kr: d, ko: d > 0 ? "일본은행 금리 인상 쪽 신호" : "일본은행 완화 쪽 신호" };
  if ((d = policy(h, ECB))) return { cat: "ecb", w: 0.75, fx: 0, kr: 0, ue: d, ko: d > 0 ? "ECB 금리 인상(긴축) 쪽 신호" : "ECB 금리 인하(완화) 쪽 신호" };
  if (/japan|tokyo|katayama|mimura|ministry of finance|\bmof\b/i.test(h) && /yen|currency|\bfx\b/i.test(h) && /interven|rate check|warn|excessive|speculat|vigilan|alarm|decisive/i.test(h))
    return { cat: "jpfx", w: 0.8, fx: -1, kr: 0, ko: "일본 엔화 방어(개입 경계)" };
  if ((d = dir(h, "\\bjgb yields?|japan(?:ese|'s)? (?:\\w+ )?(?:bond )?yields?|\\bjgbs?\\b"))) return { cat: "jgb", w: 0.7, fx: 0, kr: d, ko: d > 0 ? "일본 국채 금리 상승" : "일본 국채 금리 하락" };
  if ((d = dir(h, "usd\\/jpy|dollar[- /]yen"))) return { cat: "yen", w: 0.75, fx: d, kr: 0, ko: d > 0 ? "엔화 약세(달러/엔 상승)" : "엔화 강세(달러/엔 하락)" };
  if ((d = dir(h, "\\byen\\b"))) return { cat: "yen", w: 0.75, fx: -d, kr: 0, ko: d > 0 ? "엔화 강세" : "엔화 약세" };
  if (/yuan|renminbi|\bcny\b|\bcnh\b/i.test(h) && /midpoint|fixing|fix\b/i.test(h)) {
    if (/strong(?:est|er)/i.test(h)) return { cat: "cny", w: 0.7, fx: -1, kr: 0, ko: "위안화 강세 고시" };
    if (/weak(?:est|er)/i.test(h)) return { cat: "cny", w: 0.7, fx: 1, kr: 0, ko: "위안화 약세 고시" };
  }
  if ((d = dir(h, "yuan|renminbi"))) return { cat: "cny", w: 0.7, fx: -d, kr: 0, ko: d > 0 ? "위안화 강세" : "위안화 약세" };
  // 달러 전반(다른 나라 '달러'는 빼고)
  const hd = h.replace(OTHER_DOLLAR, "");
  if (/\b(?:strong(?:er)?|firm(?:er)?|robust|resurgent|rising)\s+(?:us\s+|u\.s\.\s+)?dollar\b/i.test(hd)) return { cat: "usd", w: 0.8, fx: 1, kr: 0, ko: "달러 강세" };
  if (/\b(?:weak(?:er)?|soft(?:er)?|falling|sliding)\s+(?:us\s+|u\.s\.\s+)?dollar\b/i.test(hd)) return { cat: "usd", w: 0.8, fx: -1, kr: 0, ko: "달러 약세" };
  if ((d = dir(hd, "\\bdollar\\b|greenback|\\bdxy\\b|dollar index"))) return { cat: "usd", w: 0.8, fx: d, kr: 0, ko: d > 0 ? "달러 강세" : "달러 약세" };
  if ((d = dir(h, "\\beuro\\b(?!zone| area|pe)"))) return { cat: "eur", w: 0.6, fx: -d, kr: 0, ko: d > 0 ? "유로 강세(달러 약세)" : "유로 약세(달러 강세)" };
  // 원자재·위험 선호
  if (/hormuz|tanker|pipeline|refiner(?:y|ies)|oil field|opec\+?/i.test(h) && /attack|fire|mine|seiz|disrupt|outage|halt|shut|cut (?:output|production)|strike/i.test(h)) return { cat: "oil", w: 0.75, fx: 1, kr: 1, ko: "원유 공급 차질" };
  if (/(?:bearish|bullish) on (?:oil|crude)/i.test(h)) { d = /bullish/i.test(h) ? 1 : -1; return { cat: "oil", w: 0.6, fx: d, kr: d, ko: d > 0 ? "유가 상승 전망" : "유가 하락 전망" }; }
  if ((d = dir(h, "\\boil\\b|crude|brent|\\bwti\\b"))) return { cat: "oil", w: 0.7, fx: d, kr: d, ko: d > 0 ? "국제유가 상승" : "국제유가 하락" };
  const EQ = "stocks|equities|wall street|nasdaq|s&p(?: 500)?|\\bdow\\b|kospi|nikkei|chipmakers|stock market";
  if (new RegExp(`(?:${EQ}|stock)[^.;:!?]{0,35}?\\b(?:sell-?off|rout|under pressure|losses|crash|bloodbath|slump|tumble|plunge|dump(?:s|ed)?|selling pressure)`, "i").test(h) || near(EQ, DOWN).test(h))
    return { cat: "risk", w: 0.7, fx: 1, kr: -1, ko: "위험회피(주가 약세)" };
  if (near(EQ, "(?:rall(?:y|ies|ied)|rebound(?:s|ed)?|record(?:s)?|surg(?:e|es|ed)|jump(?:s|ed)?|climb(?:s|ed)?|gain(?:s|ed)?|rise[sn]?|rose)").test(h))
    return { cat: "risk", w: 0.7, fx: -1, kr: 1, ko: "위험선호(주가 강세)" };
  // 관세·규제: 미국·중국·한국·세계 무역 얘기만(다른 나라끼리의 품목 관세는 뺌)
  if (/tariff|trade war|export (?:curbs|controls|restrictions)|new curbs|sanction/i.test(h) && /\b(?:us|trump|washington|white house|china|chinese|beijing|korea|korean|global|world)\b/i.test(h)) {
    if (/relief|deal|truce|agreement|pause[sd]?|exempt|lift(?:s|ed)?|roll(?:s|ed)? back|cut(?:s)? tariffs?|lower(?:s|ed)? tariffs?/i.test(h)) return { cat: "trade", w: 0.65, fx: -1, kr: 0, ko: "무역 갈등 완화" };
    return { cat: "trade", w: 0.65, fx: 1, kr: 0, ko: "무역 갈등(관세·규제)" };
  }
  if (/ceasefire|peace (?:deal|talks|agreement)|truce/i.test(h) && !/collaps|violat|break/i.test(h)) return { cat: "geo", w: 0.65, fx: -1, kr: 0, ko: "지정학 긴장 완화" };
  if (/\bwar\b|missile|air ?strikes?|drone strikes?|invasion|invade|military|troops|naval mine|airspace|escalat|attack(?:s|ed)?\b/i.test(h) && !/trade war|price war|cyber|\bpoll\b|approval|survey|interest rate|\bhikes?\b|inflation/i.test(h))
    return { cat: "geo", w: 0.65, fx: 1, kr: 0, ko: "지정학 긴장" };
  return null;
}
const RUMOR = /\bsources?\b|reportedly|people familiar|according to (?:a )?(?:person|people|source)|rumou?r|unconfirmed|said to\b|\bconsidering\b|\bmulls?\b/i;
// 엔/원·유로/원 브리핑에서 뺄 종류(그 통화와 거리가 먼 아시아·유럽 소식)
const SKIP = { jpy: new Set(["cny", "eur", "ecb"]), eur: new Set(["cny", "yen", "jpfx", "boj", "jgb"]) };

// 엔/원·유로/원 브리핑용: 같은 소식이 달러/엔(uj)·유로/달러(ue)를 어느 쪽으로 미는지(+1 = 그 환율 상승).
// 엔/원 ≈ 달러/원 ÷ 달러/엔 → 효과 = fx − uj, 유로/원 ≈ 달러/원 × 유로/달러 → 효과 = fx + ue (0 이면 그 브리핑에선 안 씀)
function cross(c) {
  const d = c.fx, k = c.kr;
  switch (c.cat) {
    case "fed": case "usd": return { uj: d, ue: -d };
    case "ust": case "data": return { uj: k, ue: -k };
    case "boj": case "jgb": return { uj: -k, ue: 0 };
    case "jpfx": return { uj: -1, ue: 0 };
    case "yen": return { uj: d, ue: 0 };
    case "eur": return { uj: 0, ue: -d };
    case "ecb": return { uj: 0, ue: c.ue };
    case "oil": return { uj: d, ue: -d };
    case "risk": case "geo": case "trade": return { uj: -d, ue: -d };
    default: return { uj: 0, ue: 0 };   // 한국·중국 소식: 원화 쪽만
  }
}

// 최근 8시간 외신 → 브리핑 요인(최대 n개, 종류마다 하나, 무게×신선도 큰 순). kind = "fx" | "kr" | "jpy" | "eur"
export function wireFactors(items, kind, now, n = 3) {
  const cut = now - 8 * 3600e3, best = new Map(), seen = new Set();
  for (const it of items || []) {
    if (!it || it.m < cut || it.m > now + 600e3) continue;
    const key = it.t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (seen.has(key)) continue;
    seen.add(key);
    const c = classify(it.t);
    if (c) { const x = cross(c); c.jpy = Math.sign(c.fx - x.uj); c.eur = Math.sign(c.fx + x.ue); }
    if (!c || !c[kind] || (SKIP[kind] && SKIP[kind].has(c.cat))) continue;
    const age = Math.max(0, now - it.m) / 3600e3, fresh = age <= 1 ? 1 : Math.max(0.4, 1 - (age - 1) * (0.6 / 7));
    const score = c.w * fresh, old = best.get(c.cat);
    if (!old || score > old.score) best.set(c.cat, { ...c, score, it });
  }
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, n).map((x) => {
    const t = x.it.t.length > 110 ? x.it.t.slice(0, 107).replace(/\s+\S*$/, "") + "…" : x.it.t;
    return { e: x[kind], ko: x.ko + (RUMOR.test(x.it.t) ? " · 소식통 인용, 미확인" : ""), t, u: x.it.u, s: x.it.s, m: x.it.m };
  });
}

export { classify };
