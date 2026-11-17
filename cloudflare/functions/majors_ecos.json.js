// 달러/엔·유로/달러 일별(한국은행 ECOS 731Y002) — 2페이지 추이·전망. 저장소 파일을 그대로 보여 준다(평일 아침 GitHub Actions 가 갱신).
import { page } from "./index.js";

export const onRequestGet = (ctx) => page(ctx, "majors_ecos.json", "application/json; charset=utf-8");
