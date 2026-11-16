// 오늘의 브리핑: 환율 따로(/api/brief?k=fx, 환율 조회 1페이지), 금리 따로(/api/brief?k=rate, 금리 모니터 첫 화면). 1분 캐시.
// 사람이 쓰거나 AI 가 쓴 글이 아니라, 아래 시세를 정해 둔 규칙으로 문장에 옮긴다(숫자를 지어내지 않음).
//  환율: 달러/원·엔/원(100엔)·유로/원 = 이 사이트 /api/intraday(Yahoo 1분), 오늘 06:00 시가 대비(사이트 ③ 하루 그래프와 같은 기준)
//        달러인덱스(DX-Y.NYB)·달러/엔(JPY=X) = Yahoo, 전일 종가 대비 / 기사 = 이 사이트 /api/news(외환)
//  금리: 국고채 3·10년, 미국채 2·10년 = 네이버 증권 시장지표(실시간), 전 거래일 대비
//        다음 금통위·FOMC 날짜 = 금리 모니터 data/forecast.json / 기사 = 금리 모니터 뉴스(국고채·시장)
// 비상업 본 사이트에서만 쓴다(Yahoo·네이버 자료). ver2 에는 이 함수가 없다.
import { cached, kstNow, options } from "../../lib/common.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

async function getJSON(url, ms = 6000) {
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}
async function yahoo(sym) {
  const j = await getJSON(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=5m&range=1d`);
  const m = j.chart.result[0].meta;
  return { now: m.regularMarketPrice, prev: m.chartPreviousClose };
}
async function naverBond(code) {
  const j = await getJSON(`https://api.stock.naver.com/marketindex/bond/${encodeURIComponent(code)}`);
  return { now: +j.closePrice, chg: Math.round(+j.fluctuations * 1000) / 10, at: Date.parse(j.localTradedAt) };   // chg: bp
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
const sg = (v, dec, unit) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dec)}${unit}`;
const dirOf = (v, th) => (v >= th ? "up" : v <= -th ? "down" : "flat");

// 그 하루(06:00~익일 06:00)의 06:00 시가 대비 움직임. 주말처럼 멈췄고 마지막 하루가 3시간도 안 됐으면 그 전 하루로
function dayMove(ID, now) {
  const t = ID && ID.m1 ? ID.m1.t : [], c = ID && ID.m1 ? ID.m1.c : [], n = t.length;
  if (!n) return null;
  const stale = now - t[n - 1] * 60000 > 2 * 3600e3;
  let end = n - 1;
  if (stale && t[end] - dayStart(t[end]) < 180) { const s0 = dayStart(t[end]); while (end > 0 && t[end] >= s0) end--; }
  const sd = dayStart(t[end]);
  let i0 = t.findIndex((x) => x >= sd);
  if (i0 < 0 || i0 > end) i0 = 0;
  const v = c[end], d = Math.round((v - c[i0]) * 10) / 10;
  return { v, d, dir: dirOf(d, 1), stale, sd, at: t[end] * 60000 };
}

// ---------------- 환율
function fxBrief(usd, jpy, eur, dxy, yen, news, now) {
  const U = dayMove(usd, now);
  if (!U) return null;
  const head = U.stale
    ? `달러/원은 마지막 거래일(${md(U.sd * 60000)} 06:00~${md((U.sd + 1440) * 60000)} 06:00)을 ${won(U.v)}으로 마쳐 그날 06:00보다`
    : `달러/원은 ${won(U.v)}으로 오늘 06:00보다`;
  let l1 = U.dir === "flat"
    ? `${head} 거의 움직이지 않았습니다(${sg(U.d, 1, "원")}).`
    : `${head} ${Math.abs(U.d).toFixed(1)}원 ${U.dir === "up" ? "올랐습니다(원화 약세)" : "내렸습니다(원화 강세)"}.`;
  let dx = null;
  if (dxy && dxy.prev) {
    dx = (dxy.now / dxy.prev - 1) * 100;
    const yy = yen && yen.prev ? `(달러/엔 ${sg((yen.now / yen.prev - 1) * 100, 2, "%")})` : "";
    if (Math.abs(dx) >= 0.1) {
      const same = (U.dir === "up" && dx > 0) || (U.dir === "down" && dx < 0);
      l1 += ` 달러인덱스가 전일보다 ${Math.abs(dx).toFixed(2)}% ${dx > 0 ? "올라 달러가 전반적으로 강하고" : "내려 달러가 전반적으로 약하고"}, `
        + (U.dir === "flat" ? "원화는 크게 움직이지 않았습니다" : same ? "원화도 같은 흐름입니다" : "원화는 반대로 움직였습니다") + yy + ".";
    } else {
      l1 += ` 달러인덱스는 전일 대비 ${sg(dx, 2, "%")}로 큰 변화가 없어 ` + (U.dir === "flat" ? "외환시장 전반이 조용합니다" : `원화만 따로 ${U.dir === "up" ? "약해졌습니다" : "강해졌습니다"}`) + yy + ".";
    }
  }
  const lines = [l1];
  // 엔·유로(같은 06:00 시가 기준)
  const J = dayMove(jpy, now), E = dayMove(eur, now), parts = [];
  if (J) parts.push(`엔/원(100엔)은 ${won(J.v)}`);
  if (E) parts.push(`유로/원은 ${won(E.v)}`);
  if (parts.length) {
    const chg = [J ? `엔 ${sg(J.d, 1, "원")}` : "", E ? `유로 ${sg(E.d, 1, "원")}` : ""].filter(Boolean).join(", ");
    lines.push(`${parts.join(", ")}입니다(${U.stale ? "마지막 거래일 " : ""}06:00 대비 ${chg}).`);
  }
  // 제목: 달러 전반과 원화가 같은 쪽이면 "속", 엇갈리면 "에도"
  let pre = "";
  if (dx != null && Math.abs(dx) >= 0.15) {
    const usdw = dx > 0 ? "달러 강세" : "달러 약세", same = (dx > 0 && U.dir === "up") || (dx < 0 && U.dir === "down");
    pre = U.dir === "flat" || same ? `${usdw} 속 ` : `${usdw}에도 `;
  }
  const f = U.dir === "up" ? `원화 약세(달러/원 ${sg(U.d, 1, "원")})` : U.dir === "down" ? `원화 강세(달러/원 ${sg(U.d, 1, "원")})` : "환율 보합";
  const links = [];
  const cut = now - 8 * 3600e3;
  const n1 = news && news.items ? news.items.filter((x) => x.lv === "외환" && x.m * 60000 >= cut).sort((a, b) => b.m - a.m)[0] : null;
  if (n1) links.push({ t: n1.t, u: n1.u, s: n1.s, at: hm(n1.m * 60000) });
  return {
    title: (U.stale ? "지난 거래일 " : "") + pre + f,
    lines, links, asof: `${md(U.at)} ${hm(U.at)}`,
    src: "Yahoo Finance(달러/원·엔/원·유로/원·달러인덱스·달러/엔)",
  };
}

// ---------------- 금리
function rateBrief(k3, k10, u2, u10, fc, rnews, now) {
  if (!k3) return null;
  const today = sameKDay(k3.at, now), dir = dirOf(k3.chg, 1);
  const head = today ? `국고채 3년은 ${k3.now.toFixed(3)}%로 전 거래일보다` : `국고채 3년은 지난 거래일(${md(k3.at)}) ${k3.now.toFixed(3)}%로 마감해 그 전보다`;
  const k10s = k10 ? `10년은 ${k10.now.toFixed(3)}%(${sg(k10.chg, 1, "bp")})입니다.` : "";
  const amt = `${Math.abs(k3.chg).toFixed(1)}bp`, up = dir === "up";
  let l1;
  if (dir === "flat") l1 = k10 ? `${head} 거의 그대로였고(${sg(k3.chg, 1, "bp")}), ${k10s}` : `${head} 거의 그대로입니다(${sg(k3.chg, 1, "bp")}).`;
  else l1 = k10 ? `${head} ${amt} ${up ? "올랐고(채권 값 하락)" : "내렸고(채권 값 상승)"}, ${k10s}` : `${head} ${amt} ${up ? "올랐습니다(채권 값 하락)." : "내렸습니다(채권 값 상승)."}`;
  const lines = [l1];
  let ud = null;
  if (u10) {
    ud = dirOf(u10.chg, 1);
    const u2s = u2 ? `, 2년은 ${u2.now.toFixed(3)}%(${sg(u2.chg, 1, "bp")})` : "";
    lines.push(`미국채 10년은 ${u10.now.toFixed(3)}%(${sg(u10.chg, 1, "bp")})${u2s}로 `
      + (ud === "flat" ? "큰 변화가 없습니다." : dir === "flat" ? `${ud === "up" ? "올랐습니다" : "내렸습니다"}.` : ud === dir ? "국고채와 같은 방향입니다." : "국고채와 반대로 움직였습니다."));
  }
  // 다가오는 금리 결정(금리 전망 탭 자료)
  const ahead = [];
  const nowD = `${kp(now).y}-${pad(kp(now).mo)}-${pad(kp(now).d)}`;
  if (fc && fc.next_mpc && fc.next_mpc >= nowD) ahead.push(`한국은행 금통위 ${md(Date.parse(fc.next_mpc + "T00:00:00+09:00"))}`);
  if (fc && fc.next_fomc && fc.next_fomc >= nowD) ahead.push(`미국 FOMC ${md(Date.parse(fc.next_fomc + "T00:00:00+09:00"))}`);
  if (ahead.length) lines.push(`다가오는 금리 결정: ${ahead.join(", ")} (기관 전망은 '금리 전망' 탭).`);
  const b = dir === "up" ? `국고채 금리 상승(3년 ${sg(k3.chg, 1, "bp")})` : dir === "down" ? `국고채 금리 하락(3년 ${sg(k3.chg, 1, "bp")})` : "국고채 금리 보합";
  const us = ud == null || ud === "flat" ? "" : dir === "flat" ? `, 미국채는 ${ud === "up" ? "상승" : "하락"}` : ud === dir ? `, 미국채도 ${ud === "up" ? "상승" : "하락"}` : `, 미국채는 ${ud === "up" ? "상승" : "하락"}`;
  const links = [];
  const cut = now - 8 * 3600e3, items = rnews && (rnews.items || rnews);
  const n1 = Array.isArray(items) ? items.filter((x) => (x.g || []).includes("국고채·시장") && Date.parse(x.p) >= cut).sort((a, c) => Date.parse(c.p) - Date.parse(a.p))[0] : null;
  if (n1) links.push({ t: n1.t, u: n1.u, s: n1.s, at: hm(Date.parse(n1.p)) });
  return {
    title: (today ? "" : "지난 거래일 ") + b + us,
    lines, links, asof: `${md(k3.at)} ${hm(k3.at)}`,
    src: "네이버 증권(국고채·미국채 실시간)",
  };
}

async function build(origin, k) {
  const now = Date.now();
  let out;
  if (k === "fx") {
    const [usd, jpy, eur, dxy, yen, news] = await Promise.all([
      settle(getJSON(`${origin}/api/intraday`, 8000)), settle(getJSON(`${origin}/api/intraday?c=jpy`, 8000)), settle(getJSON(`${origin}/api/intraday?c=eur`, 8000)),
      settle(yahoo("DX-Y.NYB")), settle(yahoo("JPY=X")), settle(getJSON(`${origin}/api/news`, 8000)),
    ]);
    out = fxBrief(usd, jpy, eur, dxy, yen, news, now);
  } else {
    const [k3, k10, u2, u10, fc, rnews] = await Promise.all([
      settle(naverBond("KR3YT=RR")), settle(naverBond("KR10YT=RR")), settle(naverBond("US2YT=RR")), settle(naverBond("US10YT=RR")),
      settle(getJSON(`${origin}/rates/data/forecast.json`, 8000)), settle(getJSON(`${origin}/rates/data/news.json`, 8000)),
    ]);
    out = rateBrief(k3, k10, u2, u10, fc, rnews, now);
  }
  if (!out) throw new Error("시세를 받지 못함");
  return { k, updated: kstNow().iso, ...out };
}

export const onRequestGet = (ctx) => {
  const origin = new URL(ctx.request.url).origin, k = new URL(ctx.request.url).searchParams.get("k") || "fx";
  if (k !== "fx" && k !== "rate") return new Response("Not Found", { status: 404 });
  return cached(ctx, `brief-v5-${k}`, 60, () => build(origin, k), 300);
};
export const onRequestOptions = options;
