// 장중 원화 환율 (Yahoo Finance, 국제 시세). 1분 캐시. ?c=usd(기본, KRW=X)·jpy(JPYKRW=X, 100엔당)·eur(EURKRW=X) — 정해 둔 셋만 받는다.
// m1: 최근 72시간 1분 종가 / m10: 최근 1개월 10분봉(5분봉 2개 묶음). 시각은 epoch 분.
// fill: Wise 시장 중간 환율 1시간 간격(최근 3일).
// Yahoo 1분 시세는 월요일 06:00~09:00 뿐 아니라 평일 새벽에도 몇십 분~몇 시간씩 끊긴다(2026-11-19 00:52~08:26 확인,
// 서울 외환시장·역외 NDF 는 거래 중). 그래서 m1 의 10분 넘는 빈 구간(주말 휴장 제외)과 마지막 시세 뒤를 Wise 값으로 메우고,
// 메운 점의 위치를 m1.w([시작, 끝] 순번 묶음)로 알려 화면이 옅은 선으로 구분하게 한다.
import { cached, kstNow, options } from "../../lib/common.js";

const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

const CUR = {
  usd: { sym: "KRW=X", mult: 1, wise: "USD" },
  jpy: { sym: "JPYKRW=X", mult: 100, wise: "JPY" },   // 원/100엔
  eur: { sym: "EURKRW=X", mult: 1, wise: "EUR" },
};

async function chart(sym, interval, range) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`https://${HOSTS[i % 2]}/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`, {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", accept: "application/json" },
      });
      if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
      const res = (await r.json()).chart.result[0];
      const q = res.indicators.quote[0];
      return { t: res.timestamp, o: q.open, h: q.high, l: q.low, c: q.close };
    } catch (e) {
      last = e;
    }
  }
  throw last;
}


async function wise(src) {
  try {
    const r = await fetch(`https://wise.com/rates/history+live?source=${src}&target=KRW&length=3&resolution=hourly&unit=day`, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return [];
    return (await r.json()).filter((x) => x && x.time && x.value).map((x) => [Math.floor(x.time / 60000), x.value]);
  } catch { return []; }
}

const GAP = 1;    // 분: 1분이라도 비면 메운다(1분 예비 기록이 매분 있음). 2026-11-23 Yahoo 가 5분 간격·09:16 멈춤으로 와서 10분 기준으론 빈칸이 남았음
const HR_GAP = 10; // 예비 기록이 없을 때 1시간 간격 Wise 로는 10분 넘는 빈칸만 메운다
// 주말 휴장(한국 시간 토 07:00 ~ 월 06:00)에는 Wise 도 주말 고정 환율이라 메우지 않는다
function closed(min) {
  const d = new Date((min + 540) * 60000), wd = d.getUTCDay(), h = d.getUTCHours();
  return (wd === 6 && h >= 7) || wd === 0 || (wd === 1 && h < 6);
}
// 빈 구간마다 1분 예비 기록(bk, backup-worker)을 먼저 쓰고, 없으면 Wise 1시간 간격(hr)을 쓴다.
// Wise 와 Yahoo 는 값이 조금씩 달라(보통 1원 안팎) 그대로 붙이면 이음매가 튀므로, 빈 구간 앞뒤의 Yahoo 값에 맞춰
// 차이를 선형으로 옮겨 붙인다(모양은 Wise, 높이는 Yahoo 기준). 마지막 시세 뒤는 앞쪽 차이만 쓴다.
function near(src, t) {   // t 에서 20분 안의 가장 가까운 값
  let best = null, bd = 21;
  for (const p of src) { const d = Math.abs(p[0] - t); if (d < bd) { bd = d; best = p[1]; } }
  return best;
}
function patch(m1, bk, hr) {
  if (!m1.length) {   // Yahoo 가 통째로 비면 예비 기록만으로
    const only = bk.filter((p) => !closed(p[0]));
    return { m1: only, w: only.length ? [[0, only.length - 1]] : [] };
  }
  const out = [], runs = [];
  const put = (a, va, b, vb, from = a) => {   // from < 시각 < b 를 메운다(맞춤 기준은 a·b 의 Yahoo 값)
    const inGap = (p) => p[0] > from && p[0] < b && !closed(p[0]);
    let src = bk.filter(inGap), all = bk;
    if (!src.length && b - from > HR_GAP) { src = hr.filter(inGap); all = hr; }
    if (!src.length) return;
    const wa = near(all, a), wb = Number.isFinite(b) ? near(all, b) : null, cap = va * 0.01;
    let oa = wa === null ? null : va - wa, ob = wb === null || vb === null ? null : vb - wb;
    if (oa === null) oa = ob === null ? 0 : ob;
    if (ob === null) ob = oa;
    oa = Math.max(-cap, Math.min(cap, oa)); ob = Math.max(-cap, Math.min(cap, ob));
    const s0 = out.length;
    src.forEach((p) => {
      const f = Number.isFinite(b) ? (p[0] - a) / (b - a) : 0;
      out.push([p[0], Math.round((p[1] + oa + (ob - oa) * f) * 100) / 100]);
    });
    runs.push([s0, out.length - 1]);
  };
  m1.forEach((p, i) => { if (i && p[0] - m1[i - 1][0] > GAP) put(m1[i - 1][0], m1[i - 1][1], p[0], p[1]); out.push(p); });
  const L = m1[m1.length - 1];
  put(L[0], L[1], Infinity, null, L[0]);   // Yahoo 가 지금 멈춰 있으면 그 뒤도 바로 잇는다
  return { m1: out, w: runs };
}

async function backup(env, cur) {   // backup-worker 의 1분 기록(최근 72시간)
  try {
    if (!env || !env.DB) return [];
    const r = await env.DB.prepare("SELECT m, v FROM fx_backup WHERE cur = ? AND m >= ? ORDER BY m").bind(cur, Math.floor(Date.now() / 60000) - 72 * 60).all();
    return (r.results || []).map((x) => [x.m, x.v]);
  } catch { return []; }
}

async function build(code, env) {
  const C = CUR[code], mul = C.mult, r2 = (x) => Math.round(x * mul * 100) / 100;
  // 엔·유로: Yahoo 의 JPYKRW=X·EURKRW=X 1분 자료는 실제로 5분 간격뿐이라(하루 288개, 2026-11-25 확인)
  // 달러/원(KRW=X)과 달러/엔(JPY=X)·유로/달러(EURUSD=X) 1분 값으로 교차 환율을 계산해 그 사이를 채운다.
  // 계산값은 Yahoo 자체 교차 값과 수준이 조금 달라(엔 +2원/100엔, 유로 +1원 안팎) 앞뒤 5분 값에 맞춰 옮겨 붙인다(patch). Yahoo 자료라 진한 선.
  const XS = { jpy: ["JPY=X", (u, z) => u / z * 100], eur: ["EURUSD=X", (u, z) => u * z] }[code];
  const [a, b, w, bk, xk, xm] = await Promise.all([
    chart(C.sym, "1m", "5d").catch(() => ({ t: [], c: [] })), chart(C.sym, "5m", "1mo"), wise(C.wise), backup(env, C.wise),
    XS ? chart("KRW=X", "1m", "5d").catch(() => null) : null, XS ? chart(XS[0], "1m", "5d").catch(() => null) : null]);
  let m1 = [];
  (a.t || []).forEach((t, i) => { if (a.c[i] != null) m1.push([Math.floor(t / 60), r2(a.c[i])]); });
  if (XS && xk && xm) {
    const Z = new Map();
    xm.t.forEach((t, i) => { if (xm.c[i] != null) Z.set(Math.floor(t / 60), xm.c[i]); });
    const X = [];
    xk.t.forEach((t, i) => { const k = Math.floor(t / 60), u = xk.c[i], z = Z.get(k); if (u != null && z) X.push([k, Math.round(XS[1](u, z) * 100) / 100]); });
    if (X.length) m1 = patch(m1, X, []).m1;
  }
  if (m1.length) { const cut = m1[m1.length - 1][0] - 72 * 60; m1 = m1.filter((p) => p[0] >= cut); }
  const P = patch(m1, bk.map((p) => [p[0], r2(p[1])]), w.map((p) => [p[0], r2(p[1])]));
  m1 = P.m1;
  const bars = new Map();
  b.t.forEach((t, i) => {
    const o = b.o[i], h = b.h[i], l = b.l[i], c = b.c[i];
    if (o == null || h == null || l == null || c == null) return;
    const k = Math.floor(Math.floor(t / 60) / 10) * 10;
    const x = bars.get(k);
    if (!x) bars.set(k, [o, h, l, c]);
    else { x[1] = Math.max(x[1], h); x[2] = Math.min(x[2], l); x[3] = c; }
  });
  // ② 10분봉: Yahoo 5분봉이 없는 10분 칸은 1분 값(Yahoo 1분, 없으면 Wise 로 메운 값)으로 만든다.
  // 5분봉은 1분봉보다 늦게 시작하거나 따로 끊기기도 한다(2026-11-19 08:26~09:00 은 1분봉만 있었음)
  const isW = new Set(); P.w.forEach(([s0, s1]) => { for (let i = s0; i <= s1; i++) isW.add(i); });
  const filled = new Map(), wk = new Set();
  m1.forEach(([t, v], i) => {
    const k = Math.floor(t / 10) * 10;
    if (bars.has(k)) return;
    const x = filled.get(k), u = v / mul;
    if (!x) filled.set(k, [u, u, u, u]); else { x[1] = Math.max(x[1], u); x[2] = Math.min(x[2], u); x[3] = u; }
    if (isW.has(i)) wk.add(k);
  });
  filled.forEach((v, k) => bars.set(k, v));
  const keys = [...bars.keys()].sort((x, y) => x - y);
  return {
    cur: code, sym: C.sym, mult: mul,
    source: `Yahoo Finance ${C.sym} (국제 시세)`,
    updated: kstNow().iso,
    m1: { t: m1.map((p) => p[0]), c: m1.map((p) => p[1]), w: P.w },
    fill: { source: "Wise 시장 중간 환율(1시간 간격)", t: w.map((p) => p[0]), c: w.map((p) => r2(p[1])) },
    backup: { source: "Wise 시장 중간 환율(1분 자체 기록)", n: bk.length, last: bk.length ? bk[bk.length - 1][0] : null },
    m10: {
      t: keys, w: keys.filter((k) => wk.has(k)),
      o: keys.map((k) => r2(bars.get(k)[0])), h: keys.map((k) => r2(bars.get(k)[1])),
      l: keys.map((k) => r2(bars.get(k)[2])), c: keys.map((k) => r2(bars.get(k)[3])),
    },
  };
}

export const onRequestGet = (ctx) => {
  const c = new URL(ctx.request.url).searchParams.get("c") || "usd";
  if (!CUR[c]) return new Response("Not Found", { status: 404 });
  return cached(ctx, c === "usd" ? "intraday-v7" : `intraday-v7-${c}`, 60, () => build(c, ctx.env), 600);
};
export const onRequestOptions = options;
