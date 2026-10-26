// ver2 커뮤니티 API — 본 사이트와 같은 코드(cloudflare/functions/api/community)·같은 D1(fx-community)을 쓴다.
// 그래서 두 사이트의 글·댓글은 하나로 이어지고, 관리(가리기·IP 차단)는 본 사이트 /admin 로그인으로 한다.
export { onRequest } from "../../../../cloudflare/functions/api/community/[[path]].js";
