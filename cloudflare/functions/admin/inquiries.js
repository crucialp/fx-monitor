// GET /admin/inquiries : 문의함(로그인 안 돼 있으면 /admin 로그인 화면으로)
import { isAdmin, PRIVATE } from "../../lib/auth.js";
import { inqPage } from "../../lib/admin_page.js";

export async function onRequestGet(ctx) {
  if (!(await isAdmin(ctx))) return new Response(null, { status: 302, headers: { location: "/admin", ...PRIVATE } });
  return new Response(inqPage(), { headers: { "content-type": "text/html; charset=utf-8", ...PRIVATE } });
}
