"""서울외국환중개(SMBS) 원/달러 매매기준율 일별 데이터 수집 → docs/usdkrw_smbs.json

  python scripts/fetch_smbs.py          # 최근 40일만 다시 받아 기존 파일에 병합 (GitHub Actions 기본)
  python scripts/fetch_smbs.py --full   # 2000년부터 전부 다시 받기
  python scripts/fetch_smbs.py --auto   # 5분 주기 실행용: KST 8~13시이고 오늘 값이 아직 없을 때만 요청

값이 바뀐 날만 파일을 다시 쓴다(변경 없으면 커밋도 생기지 않음).
"""
import datetime as dt
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

START_YEAR = 2000
URL = "http://www.smbs.biz/ExRate/StdExRate_xml.jsp?arr_value=USD_{s}_{e}"
OUT = Path(__file__).resolve().parent.parent / "docs" / "usdkrw_smbs.json"
PAT = re.compile(r"label='(\d{2})\.(\d{2})\.(\d{2})'\s+value='([\d.]+)'")
KST = dt.timezone(dt.timedelta(hours=9))


def fetch_range(start, end):
    req = urllib.request.Request(URL.format(s=start.isoformat(), e=end.isoformat()),
                                 headers={"User-Agent": "Mozilla/5.0"})
    for attempt in range(3):
        try:
            raw = urllib.request.urlopen(req, timeout=60).read().decode("euc-kr", "ignore")
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(5)
    out = {}
    for yy, mm, dd, val in PAT.findall(raw):
        year = 2000 + int(yy) if int(yy) < 70 else 1900 + int(yy)
        out[f"{year}-{mm}-{dd}"] = float(val)
    return out


def main():
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
        for y in range(START_YEAR, today.year + 1):
            series.update(fetch_range(dt.date(y, 1, 1), min(dt.date(y, 12, 31), today)))
            time.sleep(0.5)
    else:
        got = fetch_range(today - dt.timedelta(days=40), today)
        if not got:
            raise SystemExit("SMBS 응답에 데이터가 없음")
        series.update(got)
    d = sorted(series)
    if series == before:
        print(f"변경 없음 (최신 {d[-1]} {series[d[-1]]})")
        return
    data = {"source": "서울외국환중개 매매기준율 (USD)",
            "updated": dt.datetime.now(KST).strftime("%Y-%m-%dT%H:%M"),
            "d": d, "v": [series[k] for k in d]}
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"저장 {len(d)}일, {d[0]} ~ {d[-1]} 최신 {series[d[-1]]}")


if __name__ == "__main__":
    main()
