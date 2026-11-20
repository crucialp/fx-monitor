// 앱 환율 알림 규칙: 검사·정리와 문장 만들기. Pages 함수(/api/push/*)와 backup-worker 가 함께 쓴다.
//  t 목표 환율 [{id, c, op:"ge"|"le", v, on}]  최대 6개 — 닿으면 한 번 보내고 꺼진다(앱에서 다시 켬)
//  s 급변      [{c, w, on}]  통화당 1개 — 최근 60분 동안 w원 이상 움직이면(같은 통화 2시간에 한 번까지)
//  m 아침 요약 {on} — 평일 08:30
export const CURS = {
  usd: { name: "달러/원", unit: "원" },
  jpy: { name: "엔/원(100엔)", unit: "원" },
  eur: { name: "유로/원", unit: "원" },
};
const num = (x) => typeof x === "number" && Number.isFinite(x);

export function cleanRules(r) {
  r = r && typeof r === "object" ? r : {};
  const t = (Array.isArray(r.t) ? r.t : []).slice(0, 6).filter((x) => x && CURS[x.c] && (x.op === "ge" || x.op === "le") && num(x.v) && x.v > 1 && x.v < 100000)
    .map((x, i) => ({ id: String(x.id || "t" + i).replace(/[^\w-]/g, "").slice(0, 16) || "t" + i, c: x.c, op: x.op, v: Math.round(x.v * 100) / 100, on: x.on !== false }));
  const seen = new Set();
  const s = (Array.isArray(r.s) ? r.s : []).filter((x) => x && CURS[x.c] && num(x.w) && x.w >= 1 && x.w <= 300 && !seen.has(x.c) && seen.add(x.c))
    .map((x) => ({ c: x.c, w: Math.round(x.w * 10) / 10, on: x.on !== false }));
  const m = { on: !!(r.m && r.m.on) };
  return { t, s, m };
}
export const active = (r) => (r.t.some((x) => x.on) || r.s.some((x) => x.on) || r.m.on ? 1 : 0);

export const f1 = (v) => v.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const sign = (d) => (d > 0 ? "+" : d < 0 ? "−" : "±") + f1(Math.abs(d));
