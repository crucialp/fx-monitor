// ver2 문의 API — 본 사이트와 같은 코드(cloudflare/functions/api/contact)·같은 D1(fx-community, inquiries 표).
// 그래서 두 사이트로 들어온 문의가 한곳에 모이고(site 칸 v2), 본 사이트 /admin/inquiries 에서 읽는다.
export { onRequest } from "../../../../cloudflare/functions/api/contact/[[path]].js";
