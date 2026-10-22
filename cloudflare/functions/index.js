// 사이트 본문은 GitHub 저장소(docs/index.html)가 원본이다. 저장소가 바뀌면 1분 안에 이 사이트에도 반영된다.
async function page(ctx, file, type) {
  const cache = caches.default;
  const key = new Request(`https://cache.usdkrw.local/static-${file}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const r = await fetch(`https://raw.githubusercontent.com/crucialp/fx-monitor/main/docs/${file}?t=${Math.floor(Date.now() / 60000)}`);
  if (!r.ok) return new Response("잠시 후 다시 열어 주세요.", { status: 502, headers: { "content-type": "text/plain; charset=utf-8" } });
  const resp = new Response(await r.arrayBuffer(), { headers: { "content-type": type, "cache-control": "public, max-age=60" } });
  ctx.waitUntil(cache.put(key, resp.clone()));
  return resp;
}

export const onRequestGet = (ctx) => page(ctx, "index.html", "text/html; charset=utf-8");
export { page };
