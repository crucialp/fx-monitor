// ver2: 달러/엔·유로/달러 일별(한국은행 ECOS 731Y002, 공공데이터) — 운영 사이트 저장소의 docs/majors_ecos.json 을 1분 캐시로 중계
export async function onRequestGet() {
  const r = await fetch("https://raw.githubusercontent.com/crucialp/fx-monitor/main/docs/majors_ecos.json", { cf: { cacheTtl: 60, cacheEverything: true } });
  return new Response(r.body, { status: r.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=60" } });
}
