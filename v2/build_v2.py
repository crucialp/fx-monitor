"""ver2(상업용 시안) 사이트 만들기 → v2/dist/

지금 운영 중인 사이트(docs/index.html, 금리 모니터 docs/index.html)를 바탕으로, 광고를 붙이는 상업 사이트가 될 때
약관상 바꿔야 하는 부분만 바꾼 시안을 만든다(2026-10-26 약관 점검 결과).
  - 장중 시세(Yahoo)·지표 일정(Nasdaq)·월요일 보충(Wise)·결정 시각 확인(네이버) → TradingView 위젯(공개 사이트 무료, 표시 유지)
  - 뉴스 자동 목록(연합뉴스 RSS: 비상업 용도만 허용) → 언론사·포털 링크 모음
  - 기관 전망: 연합인포맥스 월례 설문·블룸버그·한경·로이터 집계 제외, 기관이 직접 공개한 수치만(평균 다시 계산)
  - 광고 자리(예시), 개인정보처리방침 페이지, 검색 노출 막음(시안)
실행: python v2/build_v2.py   배포: cd v2 && npx wrangler pages deploy --branch main --commit-dirty=true
"""
import json
import re
import statistics
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RATE_REPO = Path(r"C:/Users/박도담/rate-monitor")
OUT = ROOT / "v2" / "dist"
LIVE = "https://fx-monitor.pages.dev"
QL = ["4Q26", "1Q27", "2Q27", "3Q27", "4Q27"]
# 국내 기관 중 자체 보고서(또는 그 수치를 인용한 보도)가 출처인 곳 — 나머지 12곳은 연합인포맥스 월례 설문 응답
DOMESTIC_OWN = ["대신증권", "유안타증권", "iM증권", "한화투자증권", "한국투자증권", "IBK투자증권"]
DOMESTIC_SHORT = {"대신증권": "대신", "유안타증권": "유안타", "iM증권": "iM", "한화투자증권": "한화투자", "한국투자증권": "한국투자", "IBK투자증권": "IBK투자"}


def rep(s, a, b, cnt=1):
    assert s.count(a) == cnt, (a[:90], s.count(a))
    return s.replace(a, b)


def cut(s, start, end, include_end=True):
    a = s.index(start)
    b = s.index(end, a) + (len(end) if include_end else 0)
    return a, b


def fmt(v):
    return f"{round(v):,}"


# ------------------------------------------------------------------ 공통 조각
V2CSS = """<style>
.v2bar{background:#1c3d8f;color:#fff;font-family:'IBM Plex Sans KR','Malgun Gothic',system-ui,sans-serif;font-size:13px;line-height:1.5}
.v2bar-in{max-width:1180px;margin:0 auto;padding:8px 16px;display:flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline}
.v2bar b{font-weight:700}
.v2bar a{color:#fff;text-decoration:underline}
.v2bar details{flex-basis:100%}
.v2bar summary{cursor:pointer;color:#dfe6ff}
.v2bar ul{margin:6px 0 4px;padding-left:18px}
.v2bar li{margin:2px 0}
.adslot{display:grid;place-items:center;min-height:90px;margin:18px auto;max-width:1180px;border:1px solid #c9cdd5;border-radius:6px;
  background:repeating-linear-gradient(135deg,rgba(120,120,120,.06) 0 12px,rgba(120,120,120,.0) 12px 24px);color:#8a8f99;
  font-family:'IBM Plex Sans KR','Malgun Gothic',system-ui,sans-serif;font-size:12.5px;text-align:center;padding:8px}
.adslot b{display:block;font-size:13px;color:#6b7280}
.v2note{border:1px solid #c9cdd5;border-radius:8px;padding:12px 14px;background:rgba(28,61,143,.05);font-size:13.5px;line-height:1.6}
.v2note b{font-weight:600}
.tvbox{border:1px solid var(--rule,#e3e5ea);border-radius:6px;overflow:hidden;background:var(--surface,#fff)}
</style>
"""
def v2bar(here):
    return V2CSS   # 안내 막대 없음 — 스타일만


def ad(label="광고"):
    return f'<div class="adslot" role="complementary" aria-label="광고"><div><b>{label}</b></div></div>'


TV_ADV = """<div class="tvbox" style="height:560px"><div class="tradingview-widget-container" style="height:100%"><div class="tradingview-widget-container__widget" style="height:100%"></div>
<script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js" async>
{"autosize":true,"symbol":"FX_IDC:USDKRW","interval":"1","timezone":"Asia/Seoul","theme":"light","style":"2","locale":"kr","allow_symbol_change":false,"hide_side_toolbar":true,"calendar":false,"support_host":"https://www.tradingview.com"}
</script></div></div>"""
TV_QUOTE = """<div class="tradingview-widget-container"><div class="tradingview-widget-container__widget"></div>
<script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-single-quote.js" async>
{"symbol":"FX_IDC:USDKRW","width":"100%","isTransparent":true,"colorTheme":"light","locale":"kr"}
</script></div>"""
TV_CAL = """<div class="tvbox" style="height:560px"><div class="tradingview-widget-container" style="height:100%"><div class="tradingview-widget-container__widget"></div>
<script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-events.js" async>
{"colorTheme":"light","isTransparent":false,"width":"100%","height":"560","locale":"kr","importanceFilter":"0,1","countryFilter":"us,kr,jp,eu"}
</script></div></div>"""


# ================================================================== 환율 조회 ver2
def build_fx():
    s = (ROOT / "docs" / "index.html").read_text(encoding="utf-8")

    pass  # 제목은 그대로 '환율 조회'
    s = s.replace("<head>", '<head>\n<meta name="robots" content="noindex,nofollow">', 1)

    # 맨 위 전환 막대 다음에 시안 안내 + 광고 자리
    i = s.index('<nav class="sitebar"')
    j = s.index("</script>\n", i) + len("</script>\n")      # 전환 막대 + 예비 주소용 짧은 스크립트
    sitebar = s[i:j]
    s = s[:i] + sitebar + v2bar("/") + s[j:]

    # 방문 기록 신호 제거(시안은 기록하지 않음)
    a, b = cut(s, "  /* 방문 기록(사이트 주인만 /admin 에서 조회): 화면을 열 때 한 번 보낸다 */\n", "  })();\n")
    s = s[:a] + s[b:]

    # ---------------- 1페이지: TradingView 위젯으로 ----------------
    a, b = cut(s, '<main id="p1"', "</main>", include_end=False)   # </main> 은 바깥에 남김(숨김 상자 안에 들어가면 뒤 페이지 구조가 깨짐)
    p1 = s[a:b]
    head_end = p1.index(">") + 1
    new_p1 = (p1[:head_end] + '\n    <section id="rt-v2">'
              '<div class="pagehead" style="padding-top:0"><span class="eyebrow">1페이지</span><h2>실시간 달러/원</h2>'
              '<p class="muted small">TradingView 차트(FX_IDC:USDKRW, 한국 시간). 위쪽 메뉴에서 1분·5분·15분·1시간·일 봉과 기간을 바꿀 수 있습니다.</p></div>'
              + TV_QUOTE + TV_ADV +
              '<h3 style="margin:22px 0 8px">주요 지표·금리 결정 (미국·한국·일본·유로존, 중요도 높음)</h3>'
              '<p class="muted small" style="margin:0 0 8px">TradingView 경제 캘린더 — 발표·예상·이전 값(한국 시간).</p>'
              + TV_CAL
              + ad() + "\n    </section>\n"
              '    <div hidden aria-hidden="true">' + p1[head_end:] + "</div>\n  ")
    s = s[:a] + new_p1 + s[b:]
    s = rep(s, "  function renderP1(){\n", "  function renderP1(){return;   /* ver2: 1페이지는 TradingView 위젯 */\n")
    s = rep(s, "  function loadID(){\n", "  function loadID(){return Promise.resolve();   /* ver2: Yahoo 장중 시세 안 씀 */\n")
    s = rep(s, "  function drawDay(){\n", "  function drawDay(){if(!ID)return;\n")
    s = rep(s, "  function drawRange(){\n", "  function drawRange(){if(!ID)return;\n")

    # ---------------- 2페이지: 기관 전망(자체 공개 수치만) ----------------
    m = re.search(r"var INST=\{\s*f:(\{.*?\}),\s*d:(\{.*?\})\s*\};", s, re.S)
    f, d = json.loads(m.group(1)), json.loads(m.group(2))
    for k in DOMESTIC_OWN:
        assert k in d, k
    d2 = {k: d[k] for k in DOMESTIC_OWN}
    s = s[:m.start()] + "var INST={\n    f:" + json.dumps(f, ensure_ascii=False, separators=(",", ":")) + ",\n    d:" + json.dumps(d2, ensure_ascii=False, separators=(",", ":")) + "\n  };" + s[m.end():]

    def stat(g, i):
        v = sorted(x[i] for x in g.values() if x[i] is not None)
        if not v:
            return None
        return {"mean": sum(v) / len(v), "med": statistics.median(v), "lo": v[0], "hi": v[-1], "n": len(v),
                "who": [k for k, x in g.items() if x[i] is not None]}
    SF = [stat(f, i) for i in range(5)]
    SD = [stat(d2, i) for i in range(5)]

    # 리드 문장
    a = s.index('<p class="lede">공개 출처에서 분기별 수치를 확인한')
    b = s.index("</p>", a) + 4
    s = s[:a] + (f'<p class="lede">외국계 7곳과 국내 {len(d2)}곳이 직접 공개한 분기별 원/달러 전망을 기관당 하나씩 모아 평균을 냈다. 두 그룹 모두 2027년까지 완만한 원화 강세를 예상한다.</p>') + s[b:]

    # 상단 카드 2개(4Q26, 4Q27)
    def card_pair(qi):
        return (f'<span class="k"><span class="sw f"></span>외국계 ({SF[qi]["n"]}곳)</span><span class="v">{fmt(SF[qi]["mean"])}</span>\n'
                f'        <span class="k"><span class="sw d"></span>국내 ({SD[qi]["n"] if SD[qi] else 0}곳)</span><span class="v">{fmt(SD[qi]["mean"]) if SD[qi] else "–"}</span>')
    pairs = list(re.finditer(r'<span class="k"><span class="sw f"></span>외국계 \(\d+곳\)</span><span class="v">[\d,]+</span>\n\s*<span class="k"><span class="sw d"></span>국내 \(\d+곳\)</span><span class="v">[\d,]+</span>', s))
    assert len(pairs) == 2, len(pairs)
    for qi, mm in reversed(list(zip([0, 4], pairs))):
        s = s[:mm.start()] + card_pair(qi) + s[mm.end():]
    s = rep(s, '<span class="foot">국내 3Q27·4Q27은 표본이 4곳·3곳뿐</span>',
            f'<span class="foot">국내 4Q27은 표본이 {SD[4]["n"]}곳뿐</span>')

    # 분기별 평균 표
    def cells(st, sep=False):
        if not st:
            return f'<td class="n big{" sep" if sep else ""}">–</td><td class="n">–</td><td class="n">–</td><td class="n">0</td>'
        return (f'<td class="n big{" sep" if sep else ""}">{fmt(st["mean"])}</td><td class="n">{fmt(st["med"])}</td>'
                f'<td class="n">{st["lo"]:,}~{st["hi"]:,}</td><td class="n">{st["n"]}</td>')
    rows = "\n".join(f'          <tr><td class="q">{q}</td>{cells(SF[i])}{cells(SD[i], True)}</tr>' for i, q in enumerate(QL))
    a = s.index('<section id="avg">')
    tb = s.index("<tbody>", a) + len("<tbody>")
    te = s.index("</tbody>", tb)
    s = s[:tb] + "\n" + rows + "\n        " + s[te:]

    # 평균에 들어간 기관(국내) 카드
    a = s.index('<b>국내 평균에 들어간 기관</b></span>')
    b = s.index("</div>", a)
    groups = []
    for i, q in enumerate(QL):
        who = "·".join(DOMESTIC_SHORT[k] for k in SD[i]["who"]) if SD[i] else "없음"
        groups.append(f"<span>{q} ({SD[i]['n'] if SD[i] else 0}곳): {who}</span>")
    s = s[:a] + '<b>국내 평균에 들어간 기관</b></span>\n        ' + "\n        ".join(groups) + "\n      " + s[b:]
    # 표 아래 해설 → 시안 설명
    a = s.index('<ul class="notes">', s.index('<section id="avg">'))
    b = s.index("</ul>", a) + 5
    s = s[:a] + ('<ul class="notes"><li><b>국내 평균은 증권사 보고서 기준이다.</b> 유안타·대신·iM·한화투자·한국투자·IBK투자증권이 직접 낸 보고서(또는 그 수치를 인용한 보도)의 분기 경로다.</li>'
                 '<li><b>기준이 섞여 있다.</b> 유안타·대신은 분기말, iM·한화·한국투자는 분기평균, IBK투자는 연말 근사치다.</li></ul>') + s[b:]
    # 블룸버그 컨센서스 비교: 공개 보고서가 인용한 값만(MUFG·현대경제연구원), 2차 정리글 줄은 뺌. 이 사이트 평균은 다시 계산한 값
    a, b = cut(s, '  <section id="consensus">', "  </section>")
    sec = s[a:b]
    sec = re.sub(r'<tr><td class="inst">블룸버그 중간값 \(국내외 28개사\).*?</tr>\s*', "", sec, flags=re.S)
    def ours(label, sub, st, src):
        tds = "".join(f'<td class="n">{fmt(x["mean"])}</td>' if x else '<td class="n empty">–</td>' for x in st)
        return f'<tr class="ours"><td class="inst">{label}<span class="sub">{sub}</span></td><td class="date">{src[0]}</td>{tds}<td class="src"><a href="{src[1]}">{src[2]}</a></td></tr>'
    nd = "·".join(str(x["n"]) if x else "0" for x in SD)
    sec = re.sub(r'<tr class="ours"><td class="inst"><span class="sw d sq".*?</tr>',
                 ours('<span class="sw d sq" style="margin-right:8px;vertical-align:0"></span>국내 평균', nd + "곳", SD, ("9/28~10/19 발표", "#domestic", "국내 기관 표")), sec, flags=re.S)
    sec = sec.replace("① 2026년 12월 값 ② 2027년 말 값. ", "")
    sec = re.sub(r'<p class="small muted">한경 외환전문가 설문, 연합인포맥스·로이터 집계처럼.*?</p>', "", sec, flags=re.S)
    sec += ('<h3>블룸버그에서 직접 보기</h3><div class="linkgrid">'
            '<a class="lcard" href="https://www.bloomberg.com/quote/USDKRW:CUR" target="_blank" rel="noopener"><b>Bloomberg · USD/KRW 시세</b><span>실시간 시세와 관련 기사(영문)</span></a>'
            '<a class="lcard" href="https://www.bloomberg.com/markets/currencies" target="_blank" rel="noopener"><b>Bloomberg · 환율 시장</b><span>주요 통화 시세와 외환 기사(영문)</span></a>'
            '</div>' + ad())
    s = s[:a] + sec + s[b:]

    # ---------------- 3페이지 ----------------
    a, b = cut(s, '<main id="p3"', "</main>")
    p3 = s[a:b]

    def drop_rows(seg, pred):
        out, pos = [], 0
        for mt in re.finditer(r"<tr\b[^>]*>.*?</tr>", seg, re.S):
            out.append(seg[pos:mt.start()])
            if not pred(mt.group(0)):
                out.append(mt.group(0))
            pos = mt.end()
        out.append(seg[pos:])
        return "".join(out)
    only_kb = lambda r: (set(re.findall(r'href="https?://([^/"]+)', r)) or {"x"}) <= {"kbthink.com", "www.kbthink.com"}
    # 국내 마스터 표·견해 표: 연합인포맥스 설문(KB Think 재게재)만 출처인 줄 삭제
    da = p3.index("국내 기관")
    p3 = p3[:da] + drop_rows(p3[da:p3.index('<section id="aggregates">')], only_kb) + p3[p3.index('<section id="aggregates">'):]
    # 기타 집계(한경 설문·인포맥스 집계·로이터 등) 칸 삭제
    ga, gb = cut(p3, '<section id="aggregates">', "</section>")
    p3 = p3[:ga] + p3[gb:]
    # 평균에서 뺀 자료: 설문 줄 삭제
    xa = p3.index("<h2>평균에서 뺀 자료</h2>")
    xb = p3.index("<h2>산출 기준과 한계</h2>")
    p3 = p3[:xa] + drop_rows(p3[xa:xb], only_kb) + p3[xb:]
    # 산출 기준 문구
    p3 = rep(p3, "설문 응답과 자체 보고서가 함께 있으면 더 늦게 나온 것을 쓴다.", "기관이 직접 공개한 보고서나 그 수치를 인용한 보도만 쓴다.")
    p3 = rep(p3, "<b>집계치 분리.</b> 블룸버그·한경·로이터 집계는 개별 응답을 이미 포함하므로 따로 표기했다.",
             "<b>집계치 분리.</b> 블룸버그 컨센서스는 공개 보고서가 인용한 값을 비교용으로만 싣고 평균에는 넣지 않는다.")
    p3 = p3.replace("연합인포맥스 설문·UOB·Westpac은 기준 미표기다", "UOB·Westpac은 기준 미표기다")
    # 민감도(설문값 기준) 삭제
    ma = p3.index("<h3>민감도: 국내 4Q26 평균</h3>")
    mb = p3.index("</table>", ma) + len("</table>")
    mb = p3.index("</div>", mb) + len("</div>") if p3[mb:mb + 40].strip().startswith("</div>") else mb
    p3 = p3[:ma] + p3[mb:]
    # 다음 업데이트 일정의 인포맥스 설문 줄 삭제
    la = p3.index("<li><b>10/30 전후</b> 연합인포맥스 11월 설문")
    lb = p3.index("</li>", la) + 5
    p3 = p3[:la] + p3[lb:]
    p3 = p3.replace('<div class="pagefoot">', ad() + '\n    <div class="pagefoot">', 1)
    s = s[:a] + p3 + s[b:]
    s = s.replace('<li><a href="#aggregates">기타 집계</a></li>', "")   # 없앤 칸으로 가는 바로가기도 빼기

    # ---------------- 4페이지: 링크 모음만 ----------------
    old = subprocess.run(["git", "-C", str(ROOT), "show", "6c36434:docs/index.html"], capture_output=True).stdout.decode("utf-8")
    oa, ob = cut(old, '  <main id="p4" data-page="4" hidden>', "  </main>")
    p4 = old[oa:ob]
    p4 = p4.replace('<div class="pagefoot">', ad() + '\n    <div class="pagefoot">', 1)
    a, b = cut(s, '  <main id="p4" data-page="4" hidden>', "  </main>")
    s = s[:a] + p4 + s[b:]
    a, b = cut(s, "  /* ---------- 4페이지: 환율 뉴스 ---------- */", "  setTimeout(function(){if(!NEWS)loadNews()},2500);  /* 4페이지를 열기 전에 미리 받아 둔다 */\n")
    s = s[:a] + "  /* ---------- 4페이지: ver2 는 링크 모음만 ---------- */\n  function loadNews(){}\n" + s[b:]

    # 2페이지 끝 광고 자리
    a = s.index('<main id="p2"')
    pf = s.index('<div class="pagefoot">', a)
    s = s[:pf] + ad() + "\n    " + s[pf:]
    # 머리 아래 광고 자리
    s = s.replace("</header>", "</header>\n" + ad("상단 광고 영역"), 1)

    # 아래쪽 안내
    s = rep(s, '<span>방문 통계를 위해 접속 IP·대략적 위치·브라우저 정보를 90일간 기록합니다(사이트 운영자만 열람).</span>',
            '<span>이 사이트에는 광고가 표시되며 광고 사업자가 쿠키를 사용할 수 있습니다 · <a href="/privacy.html">개인정보처리방침</a></span>')
    s = s.replace("실시간 시세: TradingView (FX_IDC:USDKRW)", "실시간 시세·경제 캘린더: TradingView 위젯 (FX_IDC:USDKRW)")
    s = s.replace("시세·뉴스는 자동 갱신", "시세는 TradingView 실시간")
    return s


# ================================================================== 금리 모니터 ver2
def build_rates():
    # 뉴스를 링크 모음으로만 바꿨던 판(12a1791)을 바탕으로 — 상업용이면 연합뉴스 RSS 도 못 씀
    s = subprocess.run(["git", "-C", str(RATE_REPO), "show", "12a1791:docs/index.html"], capture_output=True).stdout.decode("utf-8")
    s = s.replace("<head>", '<head>\n<meta name="robots" content="noindex,nofollow">', 1)
    i = s.index('<nav class="sitebar"')
    j = s.index("</script>\n", i) + len("</script>\n")
    s = s[:i] + s[i:j] + v2bar("/rates/") + s[j:]
    s = s.replace("<main>", "<main>\n" + ad("상단 광고 영역"), 1)
    s = s.replace("</section>\n</main>", "</section>\n" + ad() + "\n</main>", 1)
    s = s.replace('<span data-i18n="footer2">', '<span><a href="/privacy.html">개인정보처리방침</a> · 이 사이트에는 광고가 표시되며 광고 사업자가 쿠키를 사용할 수 있습니다.</span>\n  <span data-i18n="footer2">', 1)
    return s


PRIVACY = """<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>개인정보처리방침</title>
<style>
:root{--bg:#f3f4f6;--surface:#fff;--ink:#16181d;--muted:#6b7280;--rule:#e3e5ea}
@media (prefers-color-scheme:dark){:root{--bg:#121418;--surface:#1b1e24;--ink:#eceef2;--muted:#8a919e;--rule:#2b2f37}}
body{margin:0;background:var(--bg);color:var(--ink);font-family:'IBM Plex Sans KR','Malgun Gothic',system-ui,sans-serif;font-size:15px;line-height:1.7}
.wrap{max-width:760px;margin:0 auto;padding:28px 16px 60px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:26px 0 6px}
.muted{color:var(--muted);font-size:13px}.box{background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:14px 16px;margin:14px 0}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid var(--rule);padding:6px 8px;text-align:left;font-size:14px;vertical-align:top}
a{color:#1f4fd1}
</style></head><body><div class="wrap">
<p class="muted"><a href="/">← 환율 조회</a> · <a href="/rates/">금리 모니터</a></p>
<h1>개인정보처리방침</h1>
<div class="box">환율 조회·금리 모니터(이하 '사이트')는 「개인정보 보호법」에 따라 이용자의 개인정보를 보호하고, 관련 고충을 원활하게 처리하기 위해 다음과 같이 개인정보처리방침을 둡니다.</div>
<h2>1. 처리하는 개인정보 항목</h2>
<table><tr><th>항목</th><th>수집 방법</th></tr>
<tr><td>접속 IP 주소, 접속 시각, IP로 추정한 대략적 위치(국가·도시)와 통신사·기관 이름, 브라우저·기기 정보, 들어온 주소(리퍼러), 브라우저마다 붙는 임의 번호</td><td>사이트를 열 때 자동 수집</td></tr>
<tr><td>광고 쿠키·광고 식별자</td><td>광고 사업자(예: Google AdSense)가 자체적으로 수집</td></tr></table>
<p class="muted">회원가입이 없어 이름·연락처 같은 정보는 받지 않습니다.</p>
<h2>2. 처리 목적</h2>
<p>방문 통계, 서비스 개선, 비정상 접속(봇 등) 확인, 광고 게재.</p>
<h2>3. 보유 기간</h2>
<p>접속 기록은 수집일로부터 90일이 지나면 자동으로 지웁니다. 광고 쿠키는 각 광고 사업자의 정책에 따릅니다.</p>
<h2>4. 처리 위탁</h2>
<table><tr><th>받는 곳</th><th>업무</th></tr>
<tr><td>Cloudflare, Inc.</td><td>사이트 호스팅, 접속 기록 저장(데이터베이스)</td></tr>
<tr><td>GitHub, Inc.</td><td>사이트 파일·공개 데이터 보관</td></tr></table>
<h2>5. 광고와 쿠키</h2>
<p>사이트에 표시되는 광고는 Google 등 제3자 광고 사업자가 제공하며, 이들은 쿠키를 사용해 이용자의 이 사이트 및 다른 사이트 방문 기록에 따라 광고를 보여 줄 수 있습니다.
이용자는 <a href="https://adssettings.google.com/" target="_blank" rel="noopener">Google 광고 설정</a>에서 맞춤 광고를 끄거나, 브라우저 설정에서 쿠키를 거부할 수 있습니다.</p>
<h2>6. 이용자의 권리</h2>
<p>이용자는 자신의 개인정보 열람·정정·삭제·처리 정지를 요청할 수 있습니다. 접속 기록은 IP 주소로만 구분되므로, 요청 시 접속한 IP와 시각을 알려 주시면 확인 후 처리합니다.</p>
<h2>7. 개인정보 보호책임자 · 문의</h2>
<p>운영자: [운영자 이름] · 이메일: [연락처 이메일]</p>
<h2>8. 시행일</h2>
<p>[시행일]</p>
</div></body></html>
"""


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "rates").mkdir(exist_ok=True)
    (OUT / "index.html").write_text(build_fx(), encoding="utf-8")
    (OUT / "rates" / "index.html").write_text(build_rates(), encoding="utf-8")
    (OUT / "privacy.html").write_text(PRIVACY, encoding="utf-8")
    (OUT / "robots.txt").write_text("User-agent: *\nDisallow: /\n", encoding="utf-8")
    print("ok", [p.name for p in OUT.rglob("*.html")])


if __name__ == "__main__":
    main()
