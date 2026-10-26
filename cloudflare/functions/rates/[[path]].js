// /rates/ : 금리 모니터(저장소 crucialp/rate-monitor 의 docs/)를 환율 조회와 같은 주소 아래에서 보여 준다(2026-10-26 통합).
// 데이터는 금리 모니터의 GitHub Actions 가 그 저장소 docs/data 에 계속 올리고, 여기서는 GitHub raw 를 중계만 한다
// (금리 모니터 worker/src/site.js 의 serveSite 와 같은 방식: 데이터 1분·페이지 5분 캐시, GitHub 가 안 되면 마지막 정상본).
// 페이지를 열 때 방문 1건을 금리 모니터 방문 기록 DB(RATE_DB)에 남긴다. 관리자(/admin 로그인 쿠키)가 연 것은 me=1.
import { isBot } from "../../lib/botrule.js";
import { isAdmin } from "../../lib/auth.js";

const ORIGIN = "https://raw.githubusercontent.com/crucialp/rate-monitor/main/docs";
const TYPES = {
  html: "text/html; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  json: "application/json; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  ico: "image/x-icon",
  txt: "text/plain; charset=utf-8",
};
const FRESH_SECONDS = 60;
const PAGE_SECONDS = 300;
const STALE_SECONDS = 7 * 24 * 3600;

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method Not Allowed", { status: 405 });
  const url = new URL(request.url);
  let path = decodeURIComponent(url.pathname).replace(/^\/rates/, "");
  if (path === "") return Response.redirect(`${url.origin}/rates/${url.search}`, 301);   // 상대 경로(data/…)가 맞게 끝에 / 를 붙인다
  if (path.endsWith("/")) path += "index.html";
  const ext = path.split(".").pop().toLowerCase();
  if (path.includes("..") || !TYPES[ext]) return new Response("Not Found", { status: 404 });
  if (path === "/index.html" && request.method === "GET" && env.RATE_DB) ctx.waitUntil(logVisit(ctx, url));

  const ttl = path.startsWith("/data/") ? FRESH_SECONDS : PAGE_SECONDS;
  const cache = caches.default;
  const freshKey = new Request(`${url.origin}/rates${path}`);
  const staleKey = new Request(`${url.origin}/__stale/rates${path}`);
  const hit = await cache.match(freshKey);
  if (hit) return hit;

  let origin = null;
  try { origin = await fetch(ORIGIN + path, { cf: { cacheTtl: ttl, cacheEverything: true } }); } catch { origin = null; }
  if (origin && origin.ok) {
    const body = await origin.arrayBuffer();
    const headers = { "content-type": TYPES[ext], "x-content-type-options": "nosniff" };
    const fresh = new Response(body, { headers: { ...headers, "cache-control": `public, max-age=${ttl}` } });
    const stale = new Response(body, { headers: { ...headers, "cache-control": `public, max-age=${STALE_SECONDS}` } });
    ctx.waitUntil(Promise.all([cache.put(freshKey, fresh.clone()), cache.put(staleKey, stale)]));
    return fresh;
  }
  const stale = await cache.match(staleKey);
  if (stale) return stale;
  return new Response("Not Found", { status: origin ? origin.status : 502 });
}

// 금리 모니터 site.js 의 logVisit 과 같은 칸 + me(관리자 본인)
async function logVisit(ctx, url) {
  const { request, env } = ctx;
  const ua = (request.headers.get("user-agent") || "").slice(0, 400);
  const cf = request.cf || {};
  try {
    const me = (await isAdmin(ctx)) ? 1 : 0;
    await env.RATE_DB.prepare(
      "INSERT INTO visits (ts, ip, country, city, org, ua, bot, host, query, referer, me) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
    ).bind(
      Date.now(), request.headers.get("cf-connecting-ip") || "", cf.country || "", cf.city || "", cf.asOrganization || "",
      ua, isBot(ua, cf.asOrganization) ? 1 : 0, url.host + "/rates", url.search.slice(0, 200),
      (request.headers.get("referer") || "").slice(0, 300), me,
    ).run();
  } catch (e) {
    console.log("rates visit log failed", String(e));
  }
}
