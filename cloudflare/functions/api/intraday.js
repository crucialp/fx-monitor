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

const GAP = 10;   // 분: 이보다 길게 비면 메움
// 주말 휴장(한국 시간 토 07:00 ~ 월 06:00)에는 Wise 도 주말 고정 환율이라 메우지 않는다
function closed(min) {
  const d = new Date((min + 540) * 60000), wd = d.getUTCDay(), h = d.getUTCHours();
  return (wd === 6 && h >= 7) || wd === 0 || (wd === 1 && h < 6);
}
function patch(m1, w) {
  if (!m1.length || !w.length) return { m1, w: [] };
  const out = [], runs = [];
  const put = (a, b) => {   // a < 시각 < b 인 Wise 점을 넣는다
    const s = out.length;
    w.forEach((p) => { if (p[0] > a + 3 && p[0] < b - 3 && !closed(p[0])) out.push(p); });
    if (out.length > s) runs.push([s, out.length - 1]);
  };
  m1.forEach((p, i) => { if (i && p[0] - m1[i - 1][0] > GAP) put(m1[i - 1][0], p[0]); out.push(p); });
  const last = m1[m1.length - 1][0];
  put(last + GAP - 3, Infinity);   // Yahoo 가 지금 멈춰 있으면 그 뒤도 잇는다
  return { m1: out, w: runs };
}

async function build(code) {
  const C = CUR[code], mul = C.mult, r2 = (x) => Math.round(x * mul * 100) / 100;
  const [a, b, w] = await Promise.all([chart(C.sym, "1m", "5d"), chart(C.sym, "5m", "1mo"), wise(C.wise)]);
  let m1 = [];
  a.t.forEach((t, i) => { if (a.c[i] != null) m1.push([Math.floor(t / 60), r2(a.c[i])]); });
  if (m1.length) { const cut = m1[m1.length - 1][0] - 72 * 60; m1 = m1.filter((p) => p[0] >= cut); }
  const P = patch(m1, w.map((p) => [p[0], r2(p[1])]));
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
  const keys = [...bars.keys()].sort((x, y) => x - y);
  return {
    cur: code, sym: C.sym, mult: mul,
    source: `Yahoo Finance ${C.sym} (국제 시세)`,
    updated: kstNow().iso,
    m1: { t: m1.map((p) => p[0]), c: m1.map((p) => p[1]), w: P.w },
    fill: { source: "Wise 시장 중간 환율(1시간 간격)", t: w.map((p) => p[0]), c: w.map((p) => r2(p[1])) },
    m10: {
      t: keys,
      o: keys.map((k) => r2(bars.get(k)[0])), h: keys.map((k) => r2(bars.get(k)[1])),
      l: keys.map((k) => r2(bars.get(k)[2])), c: keys.map((k) => r2(bars.get(k)[3])),
    },
  };
}

export const onRequestGet = (ctx) => {
  const c = new URL(ctx.request.url).searchParams.get("c") || "usd";
  if (!CUR[c]) return new Response("Not Found", { status: 404 });
  return cached(ctx, c === "usd" ? "intraday-v3" : `intraday-v3-${c}`, 60, () => build(c), 600);
};
export const onRequestOptions = options;
