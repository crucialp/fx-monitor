// ver2 환율 뉴스: 공식 기관 발표(한국은행·미 연준·ECB) RSS → 지금 사이트 4페이지와 같은 형식 {items:[{t,u,s,m,lv}]}
import { fetchOfficial, classifyFx } from "../../lib/official.js";

export async function onRequestGet() {
  const { items, stats } = await fetchOfficial();
  const cut = Date.now() - 30 * 86400e3;   // 공식 발표는 드물어 30일치
  const out = [];
  for (const it of items) {
    if (it.ts < cut) continue;
    const lv = classifyFx(it.t);
    if (lv) out.push({ t: it.t, u: it.u, s: it.s, m: Math.floor(it.ts / 60000), lv });
  }
  const updated = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16);
  return new Response(JSON.stringify({ updated, source: "한국은행·미 연준·ECB 보도자료 RSS", sources: stats, items: out.slice(0, 300) }), {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=120" },
  });
}
