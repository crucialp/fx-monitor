// 관리자(사이트 주인) 확인: 비밀번호는 Cloudflare 비밀 값 ADMIN_KEY 에만 있고 코드·저장소에는 없다.
// 로그인하면 HMAC 서명된 쿠키(30일, HttpOnly·Secure·SameSite=Strict)를 준다. 비밀번호를 바꾸면 모든 쿠키가 무효.

const enc = new TextEncoder();

async function hmac(key, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function same(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function checkPassword(env, pw) {
  if (!env.ADMIN_KEY || typeof pw !== "string" || !pw) return false;
  return same(await hmac(env.ADMIN_KEY, "pw:" + pw), await hmac(env.ADMIN_KEY, "pw:" + env.ADMIN_KEY));
}

export async function makeCookie(env, days = 30) {
  const exp = Date.now() + days * 86400e3;
  return `fxadm=${exp}.${await hmac(env.ADMIN_KEY, "fx-admin:" + exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${days * 86400}`;
}

export const clearCookie = "fxadm=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";

export async function isAdmin(ctx) {
  const key = ctx.env.ADMIN_KEY;
  if (!key) return false;
  const m = /(?:^|;\s*)fxadm=([^;]+)/.exec(ctx.request.headers.get("cookie") || "");
  if (!m) return false;
  const [exp, sig] = m[1].split(".");
  if (!exp || !sig || !(+exp > Date.now())) return false;
  return same(await hmac(key, "fx-admin:" + exp), sig);
}

// 관리자 화면 공통 응답 머리: 캐시·검색 노출·다른 사이트 안에 끼워 넣기 금지
export const PRIVATE = {
  "cache-control": "no-store",
  "x-robots-tag": "noindex, nofollow",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
};
