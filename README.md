# 달러/원 실시간·전망

https://crucialp.github.io/usdkrw-live/

- 1페이지 실시간: ① 드래그(TradingView FX_IDC:USDKRW, 실시간) ② 기간 설정·10분봉(최대 1개월, 한 화면 고정) ③ 하루 06:00~익일 06:00(1분 단위, 폭 전체에 맞춤)
  - ②③ 데이터는 Yahoo Finance KRW=X를 GitHub Actions가 5분마다 받아 `intraday.json`으로 배포(저장소에는 커밋하지 않음). 약 5~15분 지연.
- 2페이지 추이·전망: 서울외국환중개 매매기준율 일별(2000년~) + 국내외 기관 분기별 평균 전망
- 3페이지 기관별 상세·출처

GitHub Actions `update-data`가 5분마다 실행된다. 매매기준율은 KST 8~13시에 오늘 값이 없을 때만 요청한다. 서버·데이터 비용 없음.
수동 실행: Actions 탭 → update-data → Run workflow (전체 재수집은 full 체크).
기관 전망 수치는 `docs/index.html`을 직접 고친다.
