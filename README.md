# 환율 조회 (fx-monitor)

- 사이트(본): https://fx-monitor.pages.dev  (Cloudflare Pages, 일반 사이트 — AI 서비스 연결 없음)
- 같은 화면 백업: https://crucialp.github.io/fx-monitor/

## 구성
- `docs/` 화면과 매매기준율 데이터의 원본. Cloudflare 사이트는 이 저장소의 `docs/index.html`, `docs/usdkrw_smbs.json` 을 1분 캐시로 그대로 보여 준다(저장소에 push 하면 바로 반영).
- `cloudflare/` Cloudflare Pages Functions
  - `/api/intraday` 장중 달러/원(Yahoo KRW=X) 1분봉·10분봉, 1분 캐시
  - `/api/news` 환율 뉴스(연합인포맥스·연합뉴스 RSS, 구글 뉴스 검색) 제목·링크만, 2분 캐시
  - 배포: `cd cloudflare && npx wrangler pages deploy` (함수 코드를 바꿀 때만 필요)
- `.github/workflows/update.yml` 평일 아침 서울외국환중개 매매기준율 수집 → 커밋 → GitHub Pages 백업 배포
- `scripts/forecast_check.py` 기관 전망 수치 일관성 검사

## 페이지
1 실시간(① TradingView 드래그 ② 기간 설정·10분봉 ③ 하루 06:00~익일 06:00) · 2 추이·전망 · 3 기관별 상세·출처 · 4 뉴스

비용: 0원 (Cloudflare·GitHub 무료 한도 안).
