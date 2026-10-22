// 공용 도우미: 한국 시간, JSON 응답(CORS 허용), 캐시

export const REPO = "crucialp/usdkrw-live";
export const RAW = `https://raw.githubusercontent.com/${REPO}/main/docs/`;

export function kstNow() {
  const d = new Date(Date.now() + 9 * 3600e3);
  return { date: d.toISOString().slice(0, 10), hm: d.toISOString().slice(11, 16), iso: d.toISOString().slice(0, 16) };
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

export function json(body, status = 200, maxAge = 0) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
      ...CORS,
    },
  });
}

export function options() {
  return new Response(null, { status: 204, headers: CORS });
}

// 만든 응답을 ttl 초 동안 엣지 캐시에 두고 재사용한다. 실패 시 마지막 성공본(최대 1일)을 돌려준다.
export async function cached(ctx, name, ttl, build) {
  const cache = caches.default;
  const fresh = new Request(`https://cache.usdkrw.local/${name}`);
  const good = new Request(`https://cache.usdkrw.local/${name}-last-good`);
  const hit = await cache.match(fresh);
  if (hit) return withCors(hit);
  try {
    const body = JSON.stringify(await build());
    const mk = (age) => new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": `public, max-age=${age}` } });
    ctx.waitUntil(cache.put(fresh, mk(ttl)));
    ctx.waitUntil(cache.put(good, mk(86400)));
    return withCors(mk(ttl));
  } catch (e) {
    const last = await cache.match(good);
    if (last) return withCors(last);
    return json({ error: String(e && e.message || e) }, 502);
  }
}

function withCors(resp) {
  const r = new Response(resp.body, resp);
  for (const [k, v] of Object.entries(CORS)) r.headers.set(k, v);
  return r;
}
