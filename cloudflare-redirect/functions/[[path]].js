// 예전 주소 usdkrw-live.pages.dev → 새 주소 fx-monitor.pages.dev 로 영구 이동
export function onRequest({ request }) {
  const u = new URL(request.url);
  return new Response(null, {
    status: 301,
    headers: { location: "https://fx-monitor.pages.dev" + u.pathname + u.search, "access-control-allow-origin": "*" },
  });
}
