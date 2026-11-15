// 오늘의 브리핑(/api/brief): 달러/원·국고채·미국채의 지금 흐름을 짧은 문장으로. 1분 캐시.
// 사람이 쓰거나 AI 가 쓴 글이 아니라, 아래 시세를 정해 둔 규칙으로 문장에 옮긴다(숫자를 지어내지 않음).
//  - 달러/원: 이 사이트 /api/intraday(Yahoo KRW=X 1분) — 오늘 06:00 시가 대비(사이트 ③ 하루 그래프와 같은 기준)
//  - 달러인덱스(DX-Y.NYB)·달러/엔(JPY=X): Yahoo, 전일 종가 대비
//  - 국고채 3·10년, 미국채 10년: 네이버 증권 시장지표(실시간), 전 거래일 대비
//  - 관련 기사: 이 사이트 /api/news(외환)와 금리 모니터 뉴스(국고채·시장)에서 가장 최근 것
// 비상업 본 사이트에서만 쓴다(Yahoo·네이버 자료). ver2 에는 이 함수가 없다.
import { cached, kstNow, options } from "../../lib/common.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const T = (ms) => AbortSignal.timeout(ms);

async function getJSON(url, ms = 6000) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: T(ms) });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}
async function yahoo(sym) {
  const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=5m&range=1d`);
  const m = j.chart.result[0].meta;
  return { now: m.regularMarketPrice, prev: m.chartPreviousClose, at: (m.regularMarketTime || 0) * 1000 };
}
async function naverBond(code) {
  const j = await getJSON(`https://api.stock.naver.com/marketindex/bond/${encodeURIComponent(code)}`);
  return { now: +j.closePrice, chg: +j.fluctuations, at: Date.parse(j.localTradedAt) };
}
const settle = (p) => p.then((v) => v, () => null);

// 한국 시간 글자
const kp = (ms) => { const d = new Date(ms + 9 * 3600e3); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; };
const pad = (n) => (n < 10 ? "0" : "") + n;
const md = (ms) => { const p = kp(ms); return `${p.mo}/${p.d}`; };
const hm = (ms) => { const p = kp(ms); return `${pad(p.h)}:${pad(p.mi)}`; };
const sameKDay = (a, b) => { const x = kp(a), y = kp(b); return x.y === y.y && x.mo === y.mo && x.d === y.d; };
// 사이트와 같은 하루 시작(한국 시간 06:00), 분 단위
function dayStart(m) { const k = m + 540; let s0 = Math.floor(k / 1440) * 1440 + 360; if (k < s0) s0 -= 1440; return s0 - 540; }
const won = (v) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "원";
const pctS = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;
const bpS = (v) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}bp`;

function fxPart(ID, dxy, jpy, now) {
  const t = ID.m1.t, c = ID.m1.c, n = t.length;
  if (!n) return null;
  const stale = now - t[n - 1] * 60000 > 2 * 3600e3;
  // 기준은 사이트 ③ 하루 그래프와 같다: 그 하루(06:00~익일 06:00)의 06:00 시가 대비.
  // 주말처럼 시세가 멈췄고 마지막 하루가 3시간도 안 됐으면(토요일 새벽) 그 전 하루를 마지막 거래일로 본다.
  let end = n - 1;
  if (stale && t[end] - dayStart(t[end]) < 180) { const s0 = dayStart(t[end]); while (end > 0 && t[end] >= s0) end--; }
  const sd = dayStart(t[end]);
  let i0 = t.findIndex((x) => x >= sd);
  if (i0 < 0 || i0 > end) i0 = 0;
  const last = t[end] * 60000, open = c[i0], v = c[end], d = Math.round((v - open) * 10) / 10;
  const dir = d >= 1 ? "up" : d <= -1 ? "down" : "flat";
  const head = stale
    ? `달러/원은 마지막 거래일(${md(sd * 60000)} 06:00~${md((sd + 1440) * 60000)} 06:00)을 ${won(v)}으로 마쳐 그날 06:00보다`
    : `달러/원은 ${won(v)}으로 오늘 06:00보다`;
  let s = dir === "flat"
    ? `${head} 거의 움직이지 않았습니다(${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(1)}원).`
    : `${head} ${Math.abs(d).toFixed(1)}원 ${dir === "up" ? "올랐습니다(원화 약세)" : "내렸습니다(원화 강세)"}.`;
  let dx = null;
  if (dxy && dxy.prev) {
    dx = (dxy.now / dxy.prev - 1) * 100;
    const yen = jpy && jpy.prev ? `(달러/엔 ${pctS((jpy.now / jpy.prev - 1) * 100)})` : "";
    if (Math.abs(dx) >= 0.1) {
      const same = (dir === "up" && dx > 0) || (dir === "down" && dx < 0);
      s += ` 달러인덱스가 전일보다 ${Math.abs(dx).toFixed(2)}% ${dx > 0 ? "올라 달러가 전반적으로 강하고" : "내려 달러가 전반적으로 약하고"}, `
        + (dir === "flat" ? "원화는 크게 움직이지 않았습니다" : same ? "원화도 같은 흐름입니다" : "원화는 반대로 움직였습니다") + yen + ".";
    } else {
      s += ` 달러인덱스는 전일 대비 ${pctS(dx)}로 큰 변화가 없어 ` + (dir === "flat" ? "외환시장 전반이 조용합니다" : `원화만 따로 ${dir === "up" ? "약해졌습니다" : "강해졌습니다"}`) + yen + ".";
    }
  }
  return { text: s, dir, d, v, open, dxy: dx, at: last, stale };
}

function bondPart(k3, k10, u10, now) {
  if (!k3) return null;
  const b3 = Math.round(k3.chg * 1000) / 10, dir = b3 >= 1 ? "up" : b3 <= -1 ? "down" : "flat";
  const today = sameKDay(k3.at, now);
  const head = today ? `국고채 3년은 ${k3.now.toFixed(3)}%로 전 거래일보다` : `국고채 3년은 지난 거래일(${md(k3.at)}) ${k3.now.toFixed(3)}%로 마감해 그 전보다`;
  const k10s = k10 ? `10년은 ${k10.now.toFixed(3)}%(${bpS(Math.round(k10.chg * 1000) / 10)})입니다.` : "";
  const up = dir === "up", amt = `${Math.abs(b3).toFixed(1)}bp`;
  let s;
  if (dir === "flat") s = k10 ? `${head} 거의 그대로였고(${bpS(b3)}), ${k10s}` : `${head} 거의 그대로입니다(${bpS(b3)}).`;
  else s = k10 ? `${head} ${amt} ${up ? "올랐고(채권 값 하락)" : "내렸고(채권 값 상승)"}, ${k10s}` : `${head} ${amt} ${up ? "올랐습니다(채권 값 하락)." : "내렸습니다(채권 값 상승)."}`;
  let bu = null;
  if (u10) {
    bu = Math.round(u10.chg * 1000) / 10;
    const ud = bu >= 1 ? "up" : bu <= -1 ? "down" : "flat";
    s += ` 미국채 10년은 ${u10.now.toFixed(3)}%(${bpS(bu)})로 `
      + (ud === "flat" ? "큰 변화가 없습니다." : dir === "flat" ? `${ud === "up" ? "올랐습니다" : "내렸습니다"}.` : ud === dir ? "같은 방향입니다." : "반대로 움직였습니다.");
  }
  return { text: s, dir, b3, k3: k3.now, at: k3.at, today, u10: bu };
}

function headline(fx, bd) {
  // 달러 전반(달러인덱스)과 원화가 같은 쪽이면 "속", 엇갈리면 "에도"
  let pre = "";
  if (fx && fx.dxy != null && Math.abs(fx.dxy) >= 0.15) {
    const usd = fx.dxy > 0 ? "달러 강세" : "달러 약세", same = (fx.dxy > 0 && fx.dir === "up") || (fx.dxy < 0 && fx.dir === "down");
    pre = fx.dir === "flat" ? `${usd} 속 ` : same ? `${usd} 속 ` : `${usd}에도 `;
  }
  const f = !fx ? "" : fx.dir === "up" ? "원화 약세" : fx.dir === "down" ? "원화 강세" : "환율 보합";
  const b = !bd ? "" : (bd.today ? "" : "지난 거래일 ") + (bd.dir === "up" ? "국고채 금리 상승" : bd.dir === "down" ? "국고채 금리 하락" : "국고채 금리 보합");
  return [pre + f, b].filter(Boolean).join(", ");
}

async function build(origin) {
  const now = Date.now();
  const [ID, dxy, jpy, k3, k10, u10, news, rnews] = await Promise.all([
    settle(getJSON(`${origin}/api/intraday`, 8000)), settle(yahoo("DX-Y.NYB")), settle(yahoo("JPY=X")),
    settle(naverBond("KR3YT=RR")), settle(naverBond("KR10YT=RR")), settle(naverBond("US10YT=RR")),
    settle(getJSON(`${origin}/api/news`, 8000)), settle(getJSON(`${origin}/rates/data/news.json`, 8000)),
  ]);
  const fx = ID && ID.m1 ? fxPart(ID, dxy, jpy, now) : null;
  const bd = bondPart(k3, k10, u10, now);
  if (!fx && !bd) throw new Error("시세를 받지 못함");
  const lines = [];
  if (fx) lines.push({ k: "fx", text: fx.text });
  if (bd) lines.push({ k: "bond", text: bd.text });
  // 관련 기사: 최근 8시간 안의 외환 시황 1건 + 국고채·시장 1건
  const cut = now - 8 * 3600e3, links = [];
  const fxNews = news && news.items ? news.items.filter((x) => x.lv === "외환" && x.m * 60000 >= cut).sort((a, b) => b.m - a.m)[0] : null;
  if (fxNews) links.push({ t: fxNews.t, u: fxNews.u, s: fxNews.s, at: hm(fxNews.m * 60000) });
  const items = rnews && (rnews.items || rnews);
  const bNews = Array.isArray(items) ? items.filter((x) => (x.g || []).includes("국고채·시장") && Date.parse(x.p) >= cut).sort((a, b) => Date.parse(b.p) - Date.parse(a.p))[0] : null;
  if (bNews) links.push({ t: bNews.t, u: bNews.u, s: bNews.s, at: hm(Date.parse(bNews.p)) });
  return {
    updated: kstNow().iso,
    title: headline(fx, bd),
    lines,
    links,
    asof: { fx: fx ? `${md(fx.at)} ${hm(fx.at)}` : null, bond: bd ? `${md(bd.at)} ${hm(bd.at)}` : null },
    src: "달러/원 Yahoo Finance(KRW=X) · 달러인덱스·달러/엔 Yahoo Finance · 국고채·미국채 네이버 증권",
  };
}

export const onRequestGet = (ctx) => {
  const origin = new URL(ctx.request.url).origin;
  return cached(ctx, "brief-v4", 60, () => build(origin), 300);
};
export const onRequestOptions = options;
