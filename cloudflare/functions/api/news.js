// 환율 관련 뉴스: 연합인포맥스·연합뉴스 RSS + 구글 뉴스 검색. 제목·링크·출처·시각만. 2분 캐시.
// 분류(키워드 규칙): 긴급 = 속보·개입 등 + 환율/영향 요인, 외환 = 외환시장 기사, 영향 = 환율을 움직일 재료.
import { cached, kstNow, options } from "../../lib/common.js";

const FEEDS = [
  ["연합인포맥스", "https://news.einfomax.co.kr/rss/allArticle.xml"],
  ["연합인포맥스", "https://news.einfomax.co.kr/rss/S1N16.xml"],
  ["연합인포맥스", "https://news.einfomax.co.kr/rss/S1N9.xml"],
  ["연합뉴스", "https://www.yna.co.kr/rss/economy.xml"],
];
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
    if (t && l) yield [unesc(t[1]), unesc(l[1]), when(d && d[1])];
  }
}

async function get(url) {
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
    return r.ok ? await r.text() : "";
  } catch { return ""; }
}

const norm = (t) => t.replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 60);

async function build() {
  const now = Date.now();
  const direct = await Promise.all(FEEDS.map(([s, u]) => get(u).then((x) => [s, x])));
  const google = await Promise.all(GOOGLE.map((q) => get("https://news.google.com/rss/search?" +
    new URLSearchParams({ q, hl: "ko", gl: "KR", ceid: "KR:ko" }))));
  const keep = new Map();
  const add = (src, title, link, ts) => {
    const lv = classify(title);
    if (!lv) return;
    const k = norm(title);
    const old = keep.get(k);
    if (old) {
      if (old.u.includes("news.google.com") && !link.includes("news.google.com")) { old.u = link; old.s = src; }
      return;
    }
    keep.set(k, { t: title, u: link, s: src, m: Math.floor((ts || now) / 60000), lv });
  };
  for (const [src, xml] of direct) for (const [t, l, ts] of items(xml)) add(src, t, l, ts);
  for (const xml of google) for (const [t0, l, ts] of items(xml)) {
    const m = t0.match(/^(.*) - ([^-]+)$/);
    add(m ? m[2].trim() : "구글 뉴스", m ? m[1].trim() : t0, l, ts);
  }
  const cut = Math.floor(now / 60000) - 7 * 1440;
  const out = [...keep.values()].filter((v) => v.m >= cut && v.m <= Math.floor(now / 60000) + 10).sort((a, b) => b.m - a.m).slice(0, 500);
  return { updated: kstNow().iso, items: out };
}

export const onRequestGet = (ctx) => cached(ctx, "news-v1", 120, build);
export const onRequestOptions = options;
