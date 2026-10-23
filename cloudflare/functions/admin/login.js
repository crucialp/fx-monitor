// POST /admin/login : 비밀번호가 맞으면 관리자 쿠키를 주고 /admin 으로. 틀리면 1초 쉬고 다시 입력 화면.
import { checkPassword, makeCookie, PRIVATE } from "../../lib/auth.js";
import { loginPage } from "../../lib/admin_page.js";

export async function onRequestPost(ctx) {
  let pw = "";
  try { pw = String((await ctx.request.formData()).get("pw") || ""); } catch {}
  if (await checkPassword(ctx.env, pw)) {
    return new Response(null, { status: 303, headers: { location: "/admin", "set-cookie": await makeCookie(ctx.env), ...PRIVATE } });
  }
  await new Promise((r) => setTimeout(r, 1000));
  return new Response(loginPage("비밀번호가 맞지 않습니다."), { status: 401, headers: { "content-type": "text/html; charset=utf-8", ...PRIVATE } });
}
