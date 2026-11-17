"""원/달러 매매기준율 + 달러/엔·유로/달러 일별 데이터 수집
  → docs/usdkrw_smbs.json (파일 이름은 화면 호환 때문에 그대로)
  → docs/majors_ecos.json (2페이지 추이·전망의 달러/엔·유로/달러, 2026-11-17 추가)

출처: 한국은행 경제통계시스템(ECOS) Open API
  731Y001 '주요국 통화의 대원화환율' 항목 0000001 '원/미국달러(매매기준율)' — 서울외국환중개가 고시하는 매매기준율과
          같은 값(2026-10-26 대조 확인).
  731Y002 '주요국 통화의 대미달러 환율' 항목 0000002 '일본엔/달러'(달러당 엔 = USD/JPY),
          0000003 '달러/유로'(유로당 달러 = EUR/USD).
ECOS 는 공공데이터법에 따라 공표된 공공데이터라 출처를 밝히면 상업적 이용도 가능하다(서울외국환중개 사이트를
직접 긁던 예전 fetch_smbs.py 를 대신함).

  python scripts/fetch_ecos_usdkrw.py          # 최근 40일만 다시 받아 기존 파일에 병합(파일이 없으면 2000년부터)
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
URL = "https://ecos.bok.or.kr/api/StatisticSearch/{key}/json/kr/1/20000/{table}/D/{s}/{e}/{item}"
DOCS = Path(__file__).resolve().parent.parent / "docs"
OUT = DOCS / "usdkrw_smbs.json"
OUT2 = DOCS / "majors_ecos.json"
KST = dt.timezone(dt.timedelta(hours=9))
SOURCE = "한국은행 ECOS 731Y001 원/미국달러(매매기준율) — 서울외국환중개 고시 매매기준율"
SOURCE2 = "한국은행 ECOS 731Y002 주요국 통화의 대미달러 환율 — 일본엔/달러(0000002), 달러/유로(0000003)"
MAJORS = {"jpy": "0000002", "eur": "0000003"}


def fetch_range(key, start, end, table="731Y001", item="0000001"):
    url = URL.format(key=key, table=table, item=item, s=start.strftime("%Y%m%d"), e=end.strftime("%Y%m%d"))
    for attempt in range(3):
        try:
            j = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "fx-monitor"}), timeout=60).read())
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(5)
    if "StatisticSearch" not in j:
        raise SystemExit(f"ECOS 오류({table} {item}): {j.get('RESULT')}")
    out = {}
    for r in j["StatisticSearch"].get("row", []):
        t, v = r["TIME"], r.get("DATA_VALUE")
        if v not in (None, ""):
            out[f"{t[:4]}-{t[4:6]}-{t[6:8]}"] = float(v)
    return out


def refresh(key, series, today, full, table, item):
    """series(dict 날짜→값)를 새로 받은 값으로 갱신해 돌려준다. 비어 있거나 full 이면 2000년부터."""
    if full or not series:
        return fetch_range(key, START, today, table, item)
    got = fetch_range(key, today - dt.timedelta(days=40), today, table, item)
    if not got:
        raise SystemExit(f"ECOS 응답에 데이터가 없음({table} {item})")
    out = dict(series)
    out.update(got)
    return out


def main():
    key = os.environ.get("ECOS_API_KEY", "").strip()
    if not key:
        raise SystemExit("ECOS_API_KEY 가 없음")
    now = dt.datetime.now(KST)
    today = now.date()
    full = "--full" in sys.argv

    # ---- 원/달러 매매기준율
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {"d": [], "v": []}
    series = dict(zip(old["d"], old["v"]))
    # ---- 달러/엔·유로/달러
    old2 = json.loads(OUT2.read_text(encoding="utf-8")) if OUT2.exists() else {}
    maj = {c: dict(zip(old2.get(c, {}).get("d", []), old2.get(c, {}).get("v", []))) for c in MAJORS}

    if "--auto" in sys.argv:
        have = today.isoformat() in series and all(today.isoformat() in maj[c] for c in MAJORS)
        if not (8 <= now.hour <= 13) or have:
            print("건너뜀 (시간대 밖이거나 오늘 값 있음)")
            return

    new = refresh(key, series, today, full, "731Y001", "0000001")
    d = sorted(new)
    if new == series and old.get("source") == SOURCE:
        print(f"변경 없음 (최신 {d[-1]} {new[d[-1]]})")
    else:
        data = {"source": SOURCE, "updated": now.strftime("%Y-%m-%dT%H:%M"), "d": d, "v": [new[k] for k in d]}
        OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"저장 {len(d)}일, {d[0]} ~ {d[-1]} 최신 {new[d[-1]]}")

    changed, got = False, {}
    for c, item in MAJORS.items():
        time.sleep(1)
        got[c] = refresh(key, maj[c], today, full, "731Y002", item)
        changed |= got[c] != maj[c]
    if not changed and old2.get("source") == SOURCE2:
        print("변경 없음 (엔·유로) " + ", ".join(f"{c} {max(got[c])} {got[c][max(got[c])]}" for c in MAJORS))
        return
    data2 = {"source": SOURCE2, "updated": now.strftime("%Y-%m-%dT%H:%M")}
    for c in MAJORS:
        ks = sorted(got[c])
        data2[c] = {"d": ks, "v": [got[c][k] for k in ks]}
    OUT2.write_text(json.dumps(data2, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("저장 (엔·유로) " + ", ".join(f"{c} {len(data2[c]['d'])}일 최신 {data2[c]['d'][-1]} {data2[c]['v'][-1]}" for c in MAJORS))


if __name__ == "__main__":
    main()
