// ver2: 금리 모니터 데이터 — rates.csv·meta.json 은 금리 모니터 저장소 docs/data/(한국은행 ECOS 공공데이터)를 1분 캐시로 중계,
// us.csv(미국 금리, FRED·미 연준 H.15 공공자료)는 그대로, forecast.json 은 설문 결과를 뺀 채로, news.json 은 공식 기관 발표(한국은행·미 연준·ECB) RSS 로 그 자리에서 만든다(금리 모니터 뉴스 화면과 같은 형식).
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
  // forecast.json(금리 전망): 기관 전망은 그대로, 언론사 설문 결과는 상업용에서 뺀다(설문 자료는 각 언론사 것)
  if (name === "forecast.json") {
    const r = await fetch("https://raw.githubusercontent.com/crucialp/rate-monitor/main/docs/data/forecast.json", { cf: { cacheTtl: 60, cacheEverything: true } });
    if (!r.ok) return new Response("Not Found", { status: r.status });
    const j = await r.json();
    j.survey = [];
    j.ust = (j.ust || []).filter((r) => !r.survey);
    return new Response(JSON.stringify(j), { headers: { "content-type": TYPES.json, "cache-control": "public, max-age=60" } });
  }
  const ext = name.split(".").pop();
  if (!/^(rates\.csv|meta\.json|us\.csv)$/.test(name) || !TYPES[ext]) return new Response("Not Found", { status: 404 });
  const r = await fetch("https://raw.githubusercontent.com/crucialp/rate-monitor/main/docs/data/" + name, { cf: { cacheTtl: 60, cacheEverything: true } });
  return new Response(r.body, { status: r.status, headers: { "content-type": TYPES[ext], "cache-control": "public, max-age=60" } });
}
