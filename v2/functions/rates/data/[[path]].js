// ver2: 금리 모니터 데이터 — rates.csv·meta.json 은 금리 모니터 저장소 docs/data/(한국은행 ECOS 공공데이터)를 1분 캐시로 중계,
// news.json 은 공식 기관 발표(한국은행·미 연준·ECB) RSS 로 그 자리에서 만든다(금리 모니터 뉴스 화면과 같은 형식).
import { fetchOfficial, toRateItems } from "../../../lib/official.js";

const TYPES = { csv: "text/csv; charset=utf-8", json: "application/json; charset=utf-8" };
export async function onRequestGet(ctx) {
  const name = [].concat(ctx.params.path || []).join("/");
  if (name === "news.json") {
    const { items } = await fetchOfficial();
    const cut = Date.now() - 30 * 86400e3;
    const out = toRateItems(items.filter((it) => it.ts >= cut));
    return new Response(JSON.stringify({ items: out }), { headers: { "content-type": TYPES.json, "cache-control": "public, max-age=120" } });
  }
  const ext = name.split(".").pop();
  if (!/^(rates\.csv|meta\.json)$/.test(name) || !TYPES[ext]) return new Response("Not Found", { status: 404 });
  const r = await fetch("https://raw.githubusercontent.com/crucialp/rate-monitor/main/docs/data/" + name, { cf: { cacheTtl: 60, cacheEverything: true } });
  return new Response(r.body, { status: r.status, headers: { "content-type": TYPES[ext], "cache-control": "public, max-age=60" } });
}
