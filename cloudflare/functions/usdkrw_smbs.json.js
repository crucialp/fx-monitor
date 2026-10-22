// 매매기준율 일별 데이터도 저장소 파일을 그대로 보여 준다 (평일 아침 GitHub Actions 가 갱신).
import { page } from "./index.js";

export const onRequestGet = (ctx) => page(ctx, "usdkrw_smbs.json", "application/json; charset=utf-8");
