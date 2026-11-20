// Web Push 발송(외부 라이브러리 없이 WebCrypto 만으로): RFC 8291 aes128gcm 본문 암호화 + RFC 8292 VAPID 서명.
// Pages 함수(/api/push/*: 테스트 알림)와 backup-worker(매분 조건 확인 후 발송)가 함께 쓴다.
// VAPID 비밀키는 Secret VAPID_PRIVATE(JWK JSON)로만 두고, 공개키는 app.js 의 VAPID_PUBLIC 과 같은 값이다.

const te = new TextEncoder();

export function b64u(buf) {
  const b = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function unb64u(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function cat(...parts) {
  const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hmac(key, data) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// 받는 쪽(브라우저 구독)의 p256dh·auth 로 본문을 암호화한다. salt·서버 키를 넘기면 그 값으로(검증용).
export async function encrypt(payload, p256dh, auth, fixed = {}) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  const pair = fixed.pair || await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, pair.privateKey, 256));
  const prkKey = await hmac(secret, ecdh);
  const ikm = await hmac(prkKey, cat(te.encode("WebPush: info\0"), ua, asPub, new Uint8Array([1])));
  const salt = fixed.salt || crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plain = cat(typeof payload === "string" ? te.encode(payload) : payload, new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plain));
  const rs = new Uint8Array([0, 0, 16, 0]);   // 4096
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}

// VAPID: 알림 서버(구글·애플·모질라 등)에 '이 사이트가 보낸 것'임을 서명으로 증명한다.
export async function vapidHeader(endpoint, privJwk, subject = "https://fx-monitor.pages.dev/contact/") {
  const jwk = typeof privJwk === "string" ? JSON.parse(privJwk) : privJwk;
  const aud = new URL(endpoint).origin;
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: jwk.d, x: jwk.x, y: jwk.y, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, te.encode(`${head}.${body}`));
  const pub = b64u(cat(new Uint8Array([4]), unb64u(jwk.x), unb64u(jwk.y)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${pub}`;
}

// 알림 서버 주소는 이미 알려진 곳만 받는다(아무 주소로나 요청을 보내는 중계가 되지 않게).
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/, /^push\.services\.mozilla\.com$/];
export function okEndpoint(ep) {
  try {
    const u = new URL(ep);
    return u.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(u.hostname)) && ep.length < 1000;
  } catch { return false; }
}

// sub = {endpoint, keys:{p256dh, auth}}. 결과: {ok, status, gone}(gone 이면 구독이 사라진 것이라 지운다)
export async function sendPush(sub, data, privJwk, opt = {}) {
  if (!okEndpoint(sub.endpoint)) return { ok: false, status: 0, gone: true };
  const body = await encrypt(JSON.stringify(data), sub.keys.p256dh, sub.keys.auth);
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidHeader(sub.endpoint, privJwk),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: String(opt.ttl || 3600),
      urgency: opt.urgency || "high",
      ...(opt.topic ? { topic: opt.topic } : {}),
    },
    body,
  });
  return { ok: r.ok, status: r.status, gone: r.status === 404 || r.status === 410 };
}
