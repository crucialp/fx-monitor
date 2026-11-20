// 환율 조회 앱 서비스 워커(범위 /app/): 화면 파일은 새 판 우선·끊기면 저장본, 시세 API 는 네트워크 우선·실패 시 마지막 값.
// 알림(push) 을 받아 표시하고, 누르면 해당 화면을 연다. 화면 파일을 바꾸면 VER 을 올린다.
const VER = "fxapp-v2";
const SHELL = ["/app/", "/app/app.css", "/app/app.js", "/app/manifest.webmanifest", "/app/icons/icon-192.png",
  "/fonts/pretendard/pretendardvariable-dynamic-subset.css"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VER).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("fxapp-") && k !== VER && k !== "fxapp-data").map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request, u = new URL(req.url);
  if (req.method !== "GET" || u.origin !== location.origin) return;
  // 시세·뉴스 자료: 네트워크 우선, 끊기면 마지막 값
  if (u.pathname.startsWith("/api/") || u.pathname === "/usdkrw_smbs.json") {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const cp = r.clone(); caches.open("fxapp-data").then((c) => c.put(req, cp)); }
      return r;
    }).catch(() => caches.match(req).then((r) => r || new Response(JSON.stringify({ error: "offline" }), { status: 503, headers: { "content-type": "application/json" } }))));
    return;
  }
  // 글꼴: 한 번 받으면 계속 사용
  if (u.pathname.startsWith("/fonts/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VER).then((c) => c.put(req, cp)); } return r; })));
    return;
  }
  // 앱 화면: 새 판 우선(업데이트가 바로 보이게), 4초 안에 못 받거나 끊기면 저장본
  if (u.pathname.startsWith("/app/")) {
    const key = u.pathname === "/app/index.html" ? "/app/" : u.pathname;
    e.respondWith(caches.open(VER).then((c) => {
      const net = fetch(req).then((r) => { if (r.ok && r.type === "basic") c.put(key, r.clone()); return r; });
      const slow = new Promise((res) => setTimeout(res, 4000)).then(() => c.match(key)).then((h) => h || net);
      return Promise.race([net.catch(() => c.match(key).then((h) => h || Promise.reject(new Error("offline")))), slow]);
    }));
  }
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "환율 조회", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "환율 조회", {
    body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag,
    icon: "/app/icons/icon-192.png", badge: "/app/icons/badge-96.png", data: { url: d.url || "/app/" }, lang: "ko",
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/app/", location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const w of list) if (w.url.startsWith(location.origin + "/app/")) { w.navigate(url).catch(() => {}); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
