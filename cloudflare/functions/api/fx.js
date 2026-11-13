// 5페이지 비교 차트용 시세: /api/fx?s=계열&r=기간 — Yahoo Finance(국제 시세)를 받아 종가만 돌려준다.
// 정해 둔 계열·기간만 받는다(아무 종목이나 대신 받아 주는 중계가 되지 않게). 짧은 기간 2분, 긴 기간 30분 캐시.
// 위안/원은 Yahoo 일별 자료가 비어 있어 달러/원 ÷ 달러/위안으로 계산한다.
import { cached, kstNow, options } from "../../lib/common.js";

const HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
const SYM = {
  usdkrw: { y: "KRW=X" },
  jpykrw: { y: "JPYKRW=X", mul: 100 },   // 원/100엔
  eurkrw: { y: "EURKRW=X" },
  cnykrw: { calc: ["KRW=X", "CNY=X"] },  // 원/위안 = (원/달러) ÷ (위안/달러)
  dxy: { y: "DX-Y.NYB" },
  usdjpy: { y: "JPY=X" },
  eurusd: { y: "EURUSD=X" },
  usdcny: { y: "CNY=X" },
};
// [Yahoo range, interval, 묶음 초, 남길 기간(초, 없으면 전부), 캐시 초]
const RANGE = {
  "1d": ["5d", "5m", 300, 86400, 120],
  "1w": ["5d", "15m", 900, 0, 120],
  "1m": ["1mo", "60m", 3600, 0, 300],
  "3m": ["3mo", "1d", 86400, 0, 1800],
  "1y": ["1y", "1d", 86400, 0, 1800],
  "3y": ["5y", "1d", 86400, 3 * 365 * 86400, 1800],
  "10y": ["10y", "1wk", 7 * 86400, 0, 3600],
};

async function chart(sym, range, interval) {
  let last;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`https://${HOSTS[i % 2]}/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`, {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", accept: "application/json" },
      });
      if (!r.ok) throw new Error(`Yahoo HTTP ${r.status}`);
      const res = (await r.json()).chart.result[0];
      const c = res.indicators.quote[0].close, out = [];
      (res.timestamp || []).forEach((t, k) => { if (c[k] != null && Number.isFinite(c[k])) out.push([t, c[k]]); });
      return out;
    } catch (e) { last = e; }
  }
  throw last;
}

async function build(s, r) {
  const [yr, iv, bucket, keep] = RANGE[r], def = SYM[s];
  let pts;
  if (def.calc) {
    const [a, b] = await Promise.all(def.calc.map((y) => chart(y, yr, iv)));
    const bm = new Map(b.map(([t, v]) => [Math.floor(t / bucket), v]));
    pts = a.map(([t, v]) => { const d = bm.get(Math.floor(t / bucket)); return d ? [t, v / d] : null; }).filter(Boolean);
  } else {
    pts = await chart(def.y, yr, iv);
    if (def.mul) pts = pts.map(([t, v]) => [t, v * def.mul]);
  }
  if (keep && pts.length) { const cut = pts[pts.length - 1][0] - keep; pts = pts.filter((p) => p[0] >= cut); }
  return { s, r, bucket, updated: kstNow().iso, t: pts.map((p) => p[0]), c: pts.map((p) => Math.round(p[1] * 10000) / 10000) };
}

export const onRequestGet = (ctx) => {
  const u = new URL(ctx.request.url), s = u.searchParams.get("s"), r = u.searchParams.get("r");
  if (!SYM[s] || !RANGE[r]) return new Response("Not Found", { status: 404 });
  return cached(ctx, `fx-v1-${s}-${r}`, RANGE[r][4], () => build(s, r), RANGE[r][4] * 5);
};
export const onRequestOptions = options;
