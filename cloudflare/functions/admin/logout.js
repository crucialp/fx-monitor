// GET /admin/logout : 관리자 쿠키 지우고 로그인 화면으로
import { clearCookie, PRIVATE } from "../../lib/auth.js";

export const onRequestGet = () => new Response(null, { status: 303, headers: { location: "/admin", "set-cookie": clearCookie, ...PRIVATE } });
