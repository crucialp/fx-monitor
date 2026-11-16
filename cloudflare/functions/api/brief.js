// 오늘의 브리핑: 환율 따로(/api/brief?k=fx, 환율 조회 1페이지), 금리 따로(/api/brief?k=rate, 금리 모니터 첫 화면). 1분 캐시.
// 사람이 쓰거나 AI 가 쓴 글이 아니라, 아래 시세를 정해 둔 규칙으로 문장에 옮긴다(숫자를 지어내지 않음).
// '왜'는 추정: 같은 시간에 함께 움직인 요인(달러 전반·아시아 통화·외국인 주식 매매·미국 금리·유가·지표 발표·금통위 기대)을
// 평소 하루 움직임 크기로 나눠 견줘, 대상과 같은 쪽으로 크게 움직인 것을 '영향으로 보입니다'로 적는다. 기사 제목에 원인이 있으면 함께.
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
// 코스피 외국인 순매수(억 원)·지수 등락률 — 네이버 증권, 오늘 장 자료일 때만 today
async function kospiFlow(now) {
  const [a, b] = await Promise.all([getJSON("https://m.stock.naver.com/api/index/KOSPI/integration"), getJSON("https://m.stock.naver.com/api/index/KOSPI/basic")]);
  const d = a.dealTrendInfo || {}, k = new Date(now + 9 * 3600e3).toISOString().slice(0, 10).replace(/-/g, "");
  const num = (x) => parseFloat(String(x || "").replace(/[,+]/g, ""));
  const close = num(b.closePrice), chg = num(b.compareToPreviousClosePrice);
  return { today: d.bizdate === k, foreign: num(d.foreignValue), pct: Number.isFinite(close) && Number.isFinite(chg) && close - chg ? (chg / (close - chg)) * 100 : null };
}

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

// 받침 있으면 a(이·은·과·을), 없으면 b — 괄호 안 숫자는 건너뛰고 앞 낱말로 판단
function josa(text, a, b) {
  const w = text.replace(/\s*\([^)]*\)\s*$/, "").replace(/[^가-힣]+$/, ""), ch = w.slice(-1);
  if (!ch) return b;
  return (ch.charCodeAt(0) - 0xac00) % 28 ? a : b;
}
const comma = (v) => Math.round(v).toLocaleString("en-US");
// 요인 목록 ds({e: 대상을 올리는 쪽 +1/내리는 쪽 −1, s: 평소 대비 크기, text, short}) 로 '왜' 문장. D: 대상 방향 +1/−1/0
function explain(D, ds, lead, quiet) {
  const strong = ds.filter((d) => d.s >= 1).sort((a, b) => b.s - a.s);
  if (D) {
    const pro = strong.filter((d) => d.e === D), con = strong.filter((d) => d.e === -D);
    let line;
    if (pro.length >= 2) line = `${lead} ${pro[0].text}${josa(pro[0].text, "과", "와")} ${pro[1].text}${josa(pro[1].text, "이", "가")} 겹친 영향으로 보입니다.`;
    else if (pro.length) line = `${lead} ${pro[0].text}${josa(pro[0].text, "이", "가")} 영향을 준 것으로 보입니다.`;
    else line = `시세 자료로는 뚜렷한 이유가 보이지 않습니다(${quiet}). 국내 수급에 따른 움직임일 수 있습니다.`;
    if (con.length) line += ` ${con[0].text}${josa(con[0].text, "은", "는")} 반대 방향이었습니다.`;
    return { line, pro };
  }
  const ups = strong.filter((d) => d.e > 0), dns = strong.filter((d) => d.e < 0);
  if (ups.length && dns.length) return { line: `${ups[0].text}${josa(ups[0].text, "과", "와")} ${dns[0].text}${josa(dns[0].text, "이", "가")} 맞서 크게 움직이지 않은 것으로 보입니다.`, pro: [] };
  return { line: `큰 변화를 일으킬 요인이 보이지 않습니다(${quiet}).`, pro: [] };
}
// 연합뉴스 제목 속 원인: "원/달러 환율, 美 물가 둔화에 하락 출발" → "美 물가 둔화"
function newsCause(title) {
  const t = String(title || "").replace(/^\[[^\]]*\]\s*/, "");
  const m = t.match(/,\s*([^,]{2,30}?)(?:에도|에|속|여파로?|영향으로?)\s+(?:.{0,16}?)(상승|하락|급등|급락|반등|반락|약세|강세|올라|내려|올랐|내렸|오름|내림|출발|마감|후퇴)/);
  if (!m) return null;
  const c = m[1].trim().replace(/\s*(영향|여파)$/, "");
  return /원|^\d/.test(c) ? null : c;
}
// 지표 발표 놀람: 물가·고용·성장이 예상보다 높거나 실업 지표가 낮으면 '매파'(달러·금리를 올리는 쪽) +1
const HAWK_UP = { cpi: 1, ppi: 1, pce: 1, nfp: 1, gdp: 1, rate: 1, claims: -1, unemp: -1 };
function surprises(evs, now, ccs) {
  const out = [];
  for (const e of (evs && evs.events) || []) {
    if (!ccs.includes(e.cc) || !(e.k in HAWK_UP) || e.actual == null || e.forecast == null) continue;
    if (e.t * 60000 > now || e.t * 60000 < now - 18 * 3600e3) continue;
    const a = parseFloat(String(e.actual).replace(/[,%K]/g, "")), f = parseFloat(String(e.forecast).replace(/[,%K]/g, ""));
    if (!Number.isFinite(a) || !Number.isFinite(f) || a === f) continue;
    const hawk = (a > f ? 1 : -1) * HAWK_UP[e.k], lab = e.label.replace(/\(.*$/, "");
    out.push({ hawk, short: `${lab} 예상 ${a > f ? "상회" : "하회"}`, text: `${e.label} 결과가 예상보다 ${a > f ? "높게" : "낮게"} 나온 것(${e.actual}, 예상 ${e.forecast})` });
  }
  return out;
}

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
  // 월요일처럼 그날 첫 Yahoo 시세가 06:00 보다 늦으면 ③ 하루 그래프처럼 Wise 1시간 간격 시세로 06:00 시가를 잡는다
  let open = c[i0];
  const F = (ID && ID.fill) || { t: [], c: [] };
  if (t[i0] - sd > 5) { const fi = (F.t || []).findIndex((x) => x >= sd && x < t[i0] - 5); if (fi >= 0) open = F.c[fi]; }
  const v = c[end], d = Math.round((v - open) * 10) / 10;
  return { v, d, dir: dirOf(d, 1), stale, sd, at: t[end] * 60000 };
}

// ---------------- 환율
function fxBrief(usd, jpy, eur, dxy, yen, cny, oil, u10, kospi, evs, news, now) {
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
  const l1base = (l1.match(/^.*?[다)]\.(?=\s|$)/) || [l1])[0];   // 첫 문장만(숫자 속 '.'은 건너뜀). 장중에는 달러인덱스 얘기를 '왜' 줄에서 함
  // 엔·유로(같은 06:00 시가 기준)
  const J = dayMove(jpy, now), E = dayMove(eur, now), parts = [];
  if (J) parts.push(`엔/원(100엔)은 ${won(J.v)}`);
  if (E) parts.push(`유로/원은 ${won(E.v)}`);
  if (parts.length) {
    const chg = [J ? `엔 ${sg(J.d, 1, "원")}` : "", E ? `유로 ${sg(E.d, 1, "원")}` : ""].filter(Boolean).join(", ");
    lines.push(`${parts.join(", ")}입니다(${U.stale ? "마지막 거래일 " : ""}06:00 대비 ${chg}).`);
  }
  // ---- 왜(추정): 대상 = 달러/원. +1 이면 달러/원을 올리는(원화 약세) 쪽
  const pct = (q) => (q && q.prev ? (q.now / q.prev - 1) * 100 : null);
  const ds = [];
  if (dx != null) ds.push({ e: Math.sign(dx), s: Math.abs(dx) / 0.2, short: dx > 0 ? "달러 강세" : "달러 약세", text: `달러 전반 ${dx > 0 ? "강세" : "약세"}(달러인덱스 ${sg(dx, 2, "%")})` });
  const yp = pct(yen), cp = pct(cny), asia = [yp, cp].filter((v) => v != null);
  if (asia.length) {
    const av = asia.reduce((a, b) => a + b, 0) / asia.length;
    ds.push({ e: Math.sign(av), s: Math.abs(av) / 0.25, short: av > 0 ? "엔·위안 약세" : "엔·위안 강세",
      text: `아시아 통화 ${av > 0 ? "동반 약세" : "동반 강세"}(${[yp != null ? `달러/엔 ${sg(yp, 2, "%")}` : "", cp != null ? `달러/위안 ${sg(cp, 2, "%")}` : ""].filter(Boolean).join(", ")})` });
  }
  if (kospi && kospi.today && Number.isFinite(kospi.foreign)) {
    const fn = kospi.foreign;
    ds.push({ e: fn < 0 ? 1 : -1, s: Math.abs(fn) / 2500, short: fn < 0 ? "외국인 주식 순매도" : "외국인 주식 순매수",
      text: `외국인 코스피 ${fn < 0 ? "순매도" : "순매수"}(${fn < 0 ? "−" : "+"}${comma(Math.abs(fn))}억 원${kospi.pct != null ? `, 지수 ${sg(kospi.pct, 2, "%")}` : ""})` });
  }
  if (u10) ds.push({ e: Math.sign(u10.chg), s: Math.abs(u10.chg) / 4, short: u10.chg > 0 ? "미국 금리 상승" : "미국 금리 하락", text: `미국채 10년 금리 ${u10.chg > 0 ? "상승" : "하락"}(${sg(u10.chg, 1, "bp")})` });
  const op = pct(oil);
  if (op != null) ds.push({ e: Math.sign(op), s: Math.abs(op) / 2, short: op > 0 ? "유가 상승" : "유가 하락", text: `국제유가 ${op > 0 ? "상승" : "하락"}(WTI ${sg(op, 2, "%")})` });
  for (const x of surprises(evs, now, ["US"])) ds.push({ e: x.hawk, s: 1.5, short: x.short, text: x.text });
  const D = U.dir === "up" ? 1 : U.dir === "down" ? -1 : 0;
  let why = null;
  if (!U.stale) {
    why = explain(D, ds, D > 0 ? "원화가 약해진 것은" : "원화가 강해진 것은", "달러 전반·아시아 통화·외국인 주식 매매·미국 금리 모두 변화가 작음");
    lines[0] = l1base;
    lines.splice(1, 0, why.line);
  }
  // 제목: 원인(추정)이 있으면 "A·B에 원화 강세", 없으면 달러 전반과 같은 쪽이면 "속", 엇갈리면 "에도"
  let pre = "";
  if (dx != null && Math.abs(dx) >= 0.15) {
    const usdw = dx > 0 ? "달러 강세" : "달러 약세", same = (dx > 0 && U.dir === "up") || (dx < 0 && U.dir === "down");
    pre = U.dir === "flat" || same ? `${usdw} 속 ` : `${usdw}에도 `;
  }
  const f = U.dir === "up" ? `원화 약세(달러/원 ${sg(U.d, 1, "원")})` : U.dir === "down" ? `원화 강세(달러/원 ${sg(U.d, 1, "원")})` : "환율 보합";
  if (why && why.pro.length) pre = why.pro.slice(0, 2).map((d) => d.short).join("·") + "에 ";
  const links = [];
  const cut = now - 8 * 3600e3;
  const n1 = news && news.items ? news.items.filter((x) => x.lv === "외환" && x.m * 60000 >= cut).sort((a, b) => b.m - a.m)[0] : null;
  if (n1) {
    links.push({ t: n1.t, u: n1.u, s: n1.s, at: hm(n1.m * 60000) });
    const nc = newsCause(n1.t);
    if (nc) lines.push(`기사(${n1.s} ${hm(n1.m * 60000)})는 '${nc}'${josa(nc, "을", "를")} 원인으로 들었습니다.`);
  }
  return {
    title: (U.stale ? "지난 거래일 " : "") + pre + f,
    lines, links, asof: `${md(U.at)} ${hm(U.at)}`,
    src: "Yahoo Finance(환율·달러인덱스·유가) · 네이버 증권(외국인 매매·미국채) · Nasdaq 경제 캘린더",
  };
}

// ---------------- 금리
function rateBrief(k3, k10, u2, u10, fc, rnews, usd, oil, evs, now) {
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
    lines.push(`미국채 10년은 ${u10.now.toFixed(3)}%(${sg(u10.chg, 1, "bp")})${u2s}` + (today ? "입니다."
      : "로 " + (ud === "flat" ? "큰 변화가 없습니다." : dir === "flat" ? `${ud === "up" ? "올랐습니다" : "내렸습니다"}.` : ud === dir ? "국고채와 같은 방향입니다." : "국고채와 반대로 움직였습니다.")));
  }
  // ---- 왜(추정): 대상 = 국고채 3년 금리. +1 이면 금리를 올리는 쪽
  const ds = [];
  if (u10) ds.push({ e: Math.sign(u10.chg), s: Math.abs(u10.chg) / 3, short: u10.chg > 0 ? "미국 금리 상승" : "미국 금리 하락", text: `미국채 금리 ${u10.chg > 0 ? "상승" : "하락"}(10년 ${sg(u10.chg, 1, "bp")})` });
  for (const x of surprises(evs, now, ["US", "KR"])) ds.push({ e: x.hawk, s: 1.5, short: x.short, text: x.text });
  if (fc && fc.next_mpc && fc.base_now != null) {
    const days = (Date.parse(fc.next_mpc + "T10:00:00+09:00") - now) / 864e5, rows = (fc.base || []).filter((r) => r.path && r.path[0] != null);
    const hike = rows.filter((r) => r.path[0] > fc.base_now + 1e-9).length;
    if (days >= 0 && days <= 21 && rows.length && hike / rows.length >= 0.6)
      ds.push({ e: 1, s: 1, short: "금통위 인상 기대", text: `${md(Date.parse(fc.next_mpc + "T00:00:00+09:00"))} 금통위 인상 기대(경로를 밝힌 기관 ${rows.length}곳 중 ${hike}곳 인상 전망)` });
  }
  const op = oil && oil.prev ? (oil.now / oil.prev - 1) * 100 : null;
  if (op != null) ds.push({ e: Math.sign(op), s: Math.abs(op) / 3, short: op > 0 ? "유가 상승" : "유가 하락", text: `국제유가 ${op > 0 ? "상승" : "하락"}(WTI ${sg(op, 2, "%")})` });
  const W = dayMove(usd, now);
  if (W && !W.stale) ds.push({ e: Math.sign(W.d), s: Math.abs(W.d) / 8, short: W.d > 0 ? "원화 약세" : "원화 강세", text: `원화 ${W.d > 0 ? "약세" : "강세"}(달러/원 ${sg(W.d, 1, "원")})` });
  const D = dir === "up" ? 1 : dir === "down" ? -1 : 0;
  let why = null;
  if (today) {
    why = explain(D, ds, D > 0 ? "국고채 금리가 오른 것은" : "국고채 금리가 내린 것은", "미국 금리·지표 발표·유가 모두 변화가 작음");
    lines.splice(1, 0, why.line);
  } else if (u10 && u10.at > k3.at && Math.abs(u10.chg) >= 2) {
    // 장 시작 전: 지난 거래일 이후 미국채가 크게 움직였으면 오늘 출발 방향을 추정
    lines.splice(1, 0, `지난 거래일 이후 미국채 10년 금리가 ${Math.abs(u10.chg).toFixed(1)}bp ${u10.chg > 0 ? "올라" : "내려"} 오늘 국고채 금리도 ${u10.chg > 0 ? "오름" : "내림"}세로 출발할 가능성이 있습니다.`);
  }
  // 다가오는 금리 결정(금리 전망 탭 자료)
  const ahead = [];
  const nowD = `${kp(now).y}-${pad(kp(now).mo)}-${pad(kp(now).d)}`;
  if (fc && fc.next_mpc && fc.next_mpc >= nowD) ahead.push(`한국은행 금통위 ${md(Date.parse(fc.next_mpc + "T00:00:00+09:00"))}`);
  if (fc && fc.next_fomc && fc.next_fomc >= nowD) ahead.push(`미국 FOMC ${md(Date.parse(fc.next_fomc + "T00:00:00+09:00"))}`);
  if (ahead.length) lines.push(`다가오는 금리 결정: ${ahead.join(", ")} (기관 전망은 '금리 전망' 탭).`);
  const b = dir === "up" ? `국고채 금리 상승(3년 ${sg(k3.chg, 1, "bp")})` : dir === "down" ? `국고채 금리 하락(3년 ${sg(k3.chg, 1, "bp")})` : "국고채 금리 보합";
  let us = ud == null || ud === "flat" ? "" : dir === "flat" ? `, 미국채는 ${ud === "up" ? "상승" : "하락"}` : ud === dir ? `, 미국채도 ${ud === "up" ? "상승" : "하락"}` : `, 미국채는 ${ud === "up" ? "상승" : "하락"}`;
  let pre = "";
  if (why && why.pro.length) { pre = why.pro.slice(0, 2).map((d) => d.short).join("·") + "에 "; us = ""; }
  const links = [];
  const cut = now - 8 * 3600e3, items = rnews && (rnews.items || rnews);
  const n1 = Array.isArray(items) ? items.filter((x) => (x.g || []).includes("국고채·시장") && Date.parse(x.p) >= cut).sort((a, c) => Date.parse(c.p) - Date.parse(a.p))[0] : null;
  if (n1) {
    links.push({ t: n1.t, u: n1.u, s: n1.s, at: hm(Date.parse(n1.p)) });
    const nc = newsCause(n1.t);
    if (nc) lines.push(`기사(${n1.s} ${hm(Date.parse(n1.p))})는 '${nc}'${josa(nc, "을", "를")} 원인으로 들었습니다.`);
  }
  return {
    title: (today ? "" : "지난 거래일 ") + pre + b + us,
    lines, links, asof: `${md(k3.at)} ${hm(k3.at)}`,
    src: "네이버 증권(국고채·미국채) · Yahoo Finance(유가·달러/원) · Nasdaq 경제 캘린더 · 금리 전망 탭(금통위 기대)",
  };
}

async function build(origin, k) {
  const now = Date.now();
  let out;
  if (k === "fx") {
    const ev = `${origin}/api/events?from=${Math.floor(now / 60000) - 1440}&to=${Math.floor(now / 60000)}`;
    const [usd, jpy, eur, dxy, yen, cny, oil, u10, kospi, evs, news] = await Promise.all([
      settle(getJSON(`${origin}/api/intraday`, 8000)), settle(getJSON(`${origin}/api/intraday?c=jpy`, 8000)), settle(getJSON(`${origin}/api/intraday?c=eur`, 8000)),
      settle(yahoo("DX-Y.NYB")), settle(yahoo("JPY=X")), settle(yahoo("CNY=X")), settle(yahoo("CL=F")), settle(naverBond("US10YT=RR")),
      settle(kospiFlow(now)), settle(getJSON(ev, 9000)), settle(getJSON(`${origin}/api/news`, 8000)),
    ]);
    out = fxBrief(usd, jpy, eur, dxy, yen, cny, oil, u10, kospi, evs, news, now);
  } else {
    const ev = `${origin}/api/events?from=${Math.floor(now / 60000) - 1440}&to=${Math.floor(now / 60000)}`;
    const [k3, k10, u2, u10, fc, rnews, usd, oil, evs] = await Promise.all([
      settle(naverBond("KR3YT=RR")), settle(naverBond("KR10YT=RR")), settle(naverBond("US2YT=RR")), settle(naverBond("US10YT=RR")),
      settle(getJSON(`${origin}/rates/data/forecast.json`, 8000)), settle(getJSON(`${origin}/rates/data/news.json`, 8000)),
      settle(getJSON(`${origin}/api/intraday`, 8000)), settle(yahoo("CL=F")), settle(getJSON(ev, 9000)),
    ]);
    out = rateBrief(k3, k10, u2, u10, fc, rnews, usd, oil, evs, now);
  }
  if (!out) throw new Error("시세를 받지 못함");
  return { k, updated: kstNow().iso, ...out, lines: out.lines.map((text) => ({ text })) };   // 화면은 lines[i].text 를 읽는다
}

export const onRequestGet = (ctx) => {
  const origin = new URL(ctx.request.url).origin, k = new URL(ctx.request.url).searchParams.get("k") || "fx";
  if (k !== "fx" && k !== "rate") return new Response("Not Found", { status: 404 });
  return cached(ctx, `brief-v9-${k}`, 60, () => build(origin, k), 300);
};
export const onRequestOptions = options;
