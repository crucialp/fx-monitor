// 장중 달러/원 (Yahoo Finance KRW=X, 국제 시세). 1분 캐시.
// m1: 최근 72시간 1분 종가 / m10: 최근 1개월 10분봉(5분봉 2개 묶음). 시각은 epoch 분.
// fill: Wise 시장 중간 환율 1시간 간격(최근 3일). Yahoo 는 월요일을 런던 0시(한국 09:00, 영국 서머타임 중 08:00)부터 내서
//       월요일 06:00~09:00 이 비는데(2026-10-26 확인), ③ 하루 그래프가 그 빈 구간만 이 값으로 잇는다.
import { cached, kstNow, options } from "../../lib/common.js";

const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];

async function chart(interval, range) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`https://${HOSTS[i % 2]}/v8/finance/chart/KRW=X?interval=${interval}&range=${range}`, {
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

const r2 = (x) => Math.round(x * 100) / 100;

async function wise() {
  try {
    const r = await fetch("https://wise.com/rates/history+live?source=USD&target=KRW&length=3&resolution=hourly&unit=day", {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return [];
    return (await r.json()).filter((x) => x && x.time && x.value).map((x) => [Math.floor(x.time / 60000), r2(x.value)]);
  } catch { return []; }
}

async function build() {
  const [a, b, w] = await Promise.all([chart("1m", "5d"), chart("5m", "1mo"), wise()]);
  let m1 = [];
  a.t.forEach((t, i) => { if (a.c[i] != null) m1.push([Math.floor(t / 60), r2(a.c[i])]); });
  if (m1.length) { const cut = m1[m1.length - 1][0] - 72 * 60; m1 = m1.filter((p) => p[0] >= cut); }
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
    source: "Yahoo Finance KRW=X (국제 시세)",
    updated: kstNow().iso,
    m1: { t: m1.map((p) => p[0]), c: m1.map((p) => p[1]) },
    fill: { source: "Wise 시장 중간 환율(1시간 간격)", t: w.map((p) => p[0]), c: w.map((p) => p[1]) },
    m10: {
      t: keys,
      o: keys.map((k) => r2(bars.get(k)[0])), h: keys.map((k) => r2(bars.get(k)[1])),
      l: keys.map((k) => r2(bars.get(k)[2])), c: keys.map((k) => r2(bars.get(k)[3])),
    },
  };
}

export const onRequestGet = (ctx) => cached(ctx, "intraday-v2", 60, build, 600);
export const onRequestOptions = options;
