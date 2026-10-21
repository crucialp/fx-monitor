"""달러/원 장중 데이터 수집 (Yahoo Finance KRW=X, 국제 시세) → docs/intraday.json

- m1 : 최근 약 3일치 1분봉 종가 (1페이지 ③ 하루 그래프용)
- m10: 최근 약 1개월치 10분봉 시가·고가·저가·종가 (1페이지 ② 기간 설정용, 5분봉 두 개씩 묶음)
시각은 epoch 분(UTC 기준 분 단위 정수)으로 저장한다. 표시는 페이지에서 한국 시간으로 바꾼다.
"""
import datetime as dt
import json
import time
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "docs" / "intraday.json"
HOSTS = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]
KST = dt.timezone(dt.timedelta(hours=9))


def chart(interval, rng):
    last = None
    for attempt in range(4):
        host = HOSTS[attempt % 2]
        url = f"https://{host}/v8/finance/chart/KRW=X?interval={interval}&range={rng}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            j = json.loads(urllib.request.urlopen(req, timeout=30).read())
            r = j["chart"]["result"][0]
            q = r["indicators"]["quote"][0]
            return r["timestamp"], q["open"], q["high"], q["low"], q["close"]
        except Exception as e:  # 429 등은 잠깐 쉬고 다른 호스트로
            last = e
            time.sleep(3 + attempt * 3)
    raise SystemExit(f"Yahoo 요청 실패: {last}")


def main():
    ts, _, _, _, cl = chart("1m", "5d")
    m1 = [(t // 60, round(c, 2)) for t, c in zip(ts, cl) if c is not None]
    cut = m1[-1][0] - 72 * 60 if m1 else 0
    m1 = [p for p in m1 if p[0] >= cut]

    ts, op, hi, lo, cl = chart("5m", "1mo")
    bars = {}
    for t, o, h, l, c in zip(ts, op, hi, lo, cl):
        if None in (o, h, l, c):
            continue
        k = (t // 60) // 10 * 10
        if k not in bars:
            bars[k] = [o, h, l, c]
        else:
            b = bars[k]
            b[1] = max(b[1], h); b[2] = min(b[2], l); b[3] = c
    keys = sorted(bars)
    m10 = {"t": keys, "o": [round(bars[k][0], 2) for k in keys], "h": [round(bars[k][1], 2) for k in keys],
           "l": [round(bars[k][2], 2) for k in keys], "c": [round(bars[k][3], 2) for k in keys]}

    data = {"source": "Yahoo Finance KRW=X (국제 시세)",
            "updated": dt.datetime.now(KST).strftime("%Y-%m-%dT%H:%M"),
            "m1": {"t": [p[0] for p in m1], "c": [p[1] for p in m1]},
            "m10": m10}
    OUT.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"m1 {len(m1)}개, m10 {len(keys)}개, {OUT.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
