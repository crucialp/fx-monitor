// 본 사이트(비상업)는 2026-11-17 커뮤니티를 닫았다(사용자 지시: "비상업용은 커뮤니티 없애, 문의 탭만").
// 일반 방문자는 /contact/ 로 보낸다. 운영자(/admin 로그인)에게만 화면을 그대로 열어 ver2 커뮤니티의 신고·가림 관리(?queue)를 계속 한다.
// 화면 파일(public/community)·API(functions/api/community)는 ver2 가 같이 쓰므로 지우지 않는다.
import { isAdmin } from "../../lib/auth.js";

export async function onRequest(ctx) {
  if (await isAdmin(ctx)) return ctx.next();
  return new Response(null, { status: 302, headers: { location: "/contact/", "cache-control": "no-store" } });
}
