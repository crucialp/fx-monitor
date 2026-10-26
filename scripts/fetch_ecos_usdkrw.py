"""원/달러 매매기준율 일별 데이터 수집 → docs/usdkrw_smbs.json (파일 이름은 화면 호환 때문에 그대로)

출처: 한국은행 경제통계시스템(ECOS) Open API 통계표 731Y001 '주요국 통화의 대원화환율' 항목 0000001
'원/미국달러(매매기준율)' — 서울외국환중개가 고시하는 매매기준율과 같은 값(2026-10-26 대조 확인).
ECOS 는 공공데이터법에 따라 공표된 공공데이터라 출처를 밝히면 상업적 이용도 가능하다(서울외국환중개 사이트를
직접 긁던 예전 fetch_smbs.py 를 대신함).

  python scripts/fetch_ecos_usdkrw.py          # 최근 40일만 다시 받아 기존 파일에 병합
  python scripts/fetch_ecos_usdkrw.py --full   # 2000년부터 전부 다시 받기
  python scripts/fetch_ecos_usdkrw.py --auto   # 예약 실행용: KST 8~13시이고 오늘 값이 아직 없을 때만 요청

인증키는 환경변수 ECOS_API_KEY (GitHub Secrets). ECOS 는 3분에 300회를 넘기면 키를 30분 막으므로 한 번에 한 요청만.
값이 바뀐 날만 파일을 다시 쓴다(변경 없으면 커밋도 생기지 않음).
"""
import datetime as dt
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

START = dt.date(2000, 1, 1)
URL = "https://ecos.bok.or.kr/api/StatisticSearch/{key}/json/kr/1/20000/731Y001/D/{s}/{e}/0000001"
OUT = Path(__file__).resolve().parent.parent / "docs" / "usdkrw_smbs.json"
KST = dt.timezone(dt.timedelta(hours=9))
SOURCE = "한국은행 ECOS 731Y001 원/미국달러(매매기준율) — 서울외국환중개 고시 매매기준율"


def fetch_range(key, start, end):
    url = URL.format(key=key, s=start.strftime("%Y%m%d"), e=end.strftime("%Y%m%d"))
    for attempt in range(3):
        try:
            j = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "fx-monitor"}), timeout=60).read())
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(5)
    if "StatisticSearch" not in j:
        raise SystemExit(f"ECOS 오류: {j.get('RESULT')}")
    out = {}
    for r in j["StatisticSearch"].get("row", []):
        t, v = r["TIME"], r.get("DATA_VALUE")
        if v not in (None, ""):
            out[f"{t[:4]}-{t[4:6]}-{t[6:8]}"] = float(v)
    return out


def main():
    key = os.environ.get("ECOS_API_KEY", "").strip()
    if not key:
        raise SystemExit("ECOS_API_KEY 가 없음")
    today = dt.datetime.now(KST).date()
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"d": [], "v": []}
    series = dict(zip(old["d"], old["v"]))
    before = dict(series)
    if "--auto" in sys.argv:
        now = dt.datetime.now(KST)
        if not (8 <= now.hour <= 13) or today.isoformat() in series:
            print("건너뜀 (시간대 밖이거나 오늘 값 있음)")
            return
    if "--full" in sys.argv or not series:
        series = fetch_range(key, START, today)
    else:
        got = fetch_range(key, today - dt.timedelta(days=40), today)
        if not got:
            raise SystemExit("ECOS 응답에 데이터가 없음")
        series.update(got)
    d = sorted(series)
    if series == before and old.get("source") == SOURCE:
        print(f"변경 없음 (최신 {d[-1]} {series[d[-1]]})")
        return
    data = {"source": SOURCE, "updated": dt.datetime.now(KST).strftime("%Y-%m-%dT%H:%M"),
            "d": d, "v": [series[k] for k in d]}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"저장 {len(d)}일, {d[0]} ~ {d[-1]} 최신 {series[d[-1]]}")


if __name__ == "__main__":
    main()
