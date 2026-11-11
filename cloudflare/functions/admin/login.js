// POST /admin/login : 비밀번호가 맞으면 관리자 쿠키를 주고 /admin 으로. 틀리면 1초 쉬고 다시 입력 화면.
// 같은 IP 에서 15분 안에 5번 틀리면 그 IP 는 15분 동안 시도 자체를 막는다(KV, 비밀번호 맞히기 공격 방지).
import { checkPassword, makeCookie, PRIVATE } from "../../lib/auth.js";
import { loginPage } from "../../lib/admin_page.js";

const MAX_FAIL = 5, LOCK_SECONDS = 900;

export async function onRequestPost(ctx) {
  const kv = ctx.env.KV, key = "admfail:" + (ctx.request.headers.get("cf-connecting-ip") || "?");
  const fails = kv ? +(await kv.get(key)) || 0 : 0;
  const html = (msg, status) => new Response(loginPage(msg), { status, headers: { "content-type": "text/html; charset=utf-8", ...PRIVATE } });
  if (fails >= MAX_FAIL) return html("비밀번호를 여러 번 틀려 15분 동안 막아 두었습니다. 잠시 뒤 다시 해 주세요.", 429);
  let pw = "";
  try { pw = String((await ctx.request.formData()).get("pw") || ""); } catch {}
  if (await checkPassword(ctx.env, pw)) {
    if (kv && fails) ctx.waitUntil(kv.delete(key));
    return new Response(null, { status: 303, headers: { location: "/admin", "set-cookie": await makeCookie(ctx.env), ...PRIVATE } });
  }
  if (kv) await kv.put(key, String(fails + 1), { expirationTtl: LOCK_SECONDS });
  await new Promise((r) => setTimeout(r, 1000));
  return html(fails + 1 >= MAX_FAIL ? "비밀번호를 여러 번 틀려 15분 동안 막아 두었습니다." : "비밀번호가 맞지 않습니다.", 401);
}
