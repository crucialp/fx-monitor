// ver2: 금리 모니터 데이터(한국은행 ECOS 공공데이터)를 금리 모니터 저장소 docs/data/ 에서 1분 캐시로 중계. 뉴스 파일은 쓰지 않음.
const TYPES = { csv: "text/csv; charset=utf-8", json: "application/json; charset=utf-8" };
export async function onRequestGet(ctx) {
  const name = [].concat(ctx.params.path || []).join("/");
  const ext = name.split(".").pop();
  if (!/^(rates\.csv|meta\.json)$/.test(name) || !TYPES[ext]) return new Response("Not Found", { status: 404 });
  const r = await fetch("https://raw.githubusercontent.com/crucialp/rate-monitor/main/docs/data/" + name, { cf: { cacheTtl: 60, cacheEverything: true } });
  return new Response(r.body, { status: r.status, headers: { "content-type": TYPES[ext], "cache-control": "public, max-age=60" } });
}
