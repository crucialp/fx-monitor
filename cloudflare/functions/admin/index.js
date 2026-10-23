// GET /admin : 로그인돼 있으면 방문 통계 화면, 아니면 비밀번호 입력 화면
import { isAdmin, PRIVATE } from "../../lib/auth.js";
import { loginPage, dashPage } from "../../lib/admin_page.js";

export async function onRequestGet(ctx) {
  const ok = await isAdmin(ctx);
  return new Response(ok ? dashPage() : loginPage(""), { headers: { "content-type": "text/html; charset=utf-8", ...PRIVATE } });
}
