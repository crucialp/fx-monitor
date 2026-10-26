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
.tradingview-widget-copyright{font-size:12px;text-align:right;margin:4px 2px 0;color:var(--muted,#6b7280)}
.tradingview-widget-copyright a{color:inherit;text-decoration:none}.tradingview-widget-copyright .blue-text{color:#2962ff}
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
    # 지금 사이트와 같은 ①②③ 고르기 카드(같은 class), 각 방식은 TradingView 위젯을 처음 고를 때 만든다(숨겨진 채 만들면 크기가 0)
    new_p1 = (p1[:head_end] + '''
    <section id="rt2">
    <div class="rt-bar">
      <div class="head">
        <h2>실시간 달러/원</h2>
        <p class="muted small">국제 외환시장 시세 · 한국 시간 기준 · 그래프 방식을 고르세요</p>
      </div>
      <div class="modes" role="radiogroup" aria-label="그래프 방식">
        <label class="mode"><input type="radio" name="rtmode2" value="drag"><span><b>① 드래그로 보기</b><small>1분봉 · 확대·이동</small></span></label>
        <label class="mode"><input type="radio" name="rtmode2" value="range"><span><b>② 기간 설정</b><small>1일·5일·1개월</small></span></label>
        <label class="mode"><input type="radio" name="rtmode2" value="day" checked><span><b>③ 하루</b><small>오늘 흐름 한눈에</small></span></label>
      </div>
    </div>
    <div id="tv2quote" style="min-height:72px"></div><div class="tradingview-widget-copyright"><a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">Track all markets on TradingView</span></a></div>
    <div class="mp2" data-mode="drag" hidden><p class="spec"><b>1분봉</b> · 끌어서 이동, 휠·두 손가락으로 확대. 위쪽 메뉴에서 봉 간격과 그래프 모양을 바꿀 수 있습니다.</p><div class="tvbox" style="height:560px" id="tv2drag"></div><div class="tradingview-widget-copyright"><a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">Track all markets on TradingView</span></a></div></div>
    <div class="mp2" data-mode="range" hidden><div class="ctl"><div class="seg" role="group" aria-label="기간"><button type="button" data-r2="1D">1일</button><button type="button" data-r2="5D" aria-pressed="true">5일</button><button type="button" data-r2="1M">1개월</button></div></div>
      <p class="spec">고른 기간 전체를 한 화면에 보여 줍니다. 봉 간격은 기간에 맞춰 자동으로 정해집니다.</p><div class="tvbox" style="height:520px" id="tv2range"></div><div class="tradingview-widget-copyright"><a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">Track all markets on TradingView</span></a></div></div>
    <div class="mp2" data-mode="day"><p class="spec"><b>오늘 하루</b>의 1분 흐름을 화면 폭 전체에 그립니다.</p><div class="tvbox" style="height:460px" id="tv2day"></div><div class="tradingview-widget-copyright"><a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">Track all markets on TradingView</span></a></div></div>
    <h3 style="margin:22px 0 8px">주요 지표·금리 결정 (미국·한국·일본·유로존, 중요도 높음)</h3>
    <p class="muted small" style="margin:0 0 8px">발표 · 예상 · 이전 값, 한국 시간.</p>
    <div class="tvbox" style="height:560px" id="tv2cal"></div><div class="tradingview-widget-copyright"><a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">Track all markets on TradingView</span></a></div>
    ''' + ad() + '''
    </section>
    <script>
    (function(){
      var dark=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches, th=dark?"dark":"light";
      function tv(id,file,cfg){var el=document.getElementById(id);if(!el)return;el.innerHTML="";
        var c=document.createElement("div");c.className="tradingview-widget-container";c.style.height="100%";
        var w=document.createElement("div");w.className="tradingview-widget-container__widget";w.style.height="100%";c.appendChild(w);
        var sc=document.createElement("script");sc.type="text/javascript";sc.async=true;sc.src="https://s3.tradingview.com/external-embedding/"+file;sc.text=JSON.stringify(cfg);c.appendChild(sc);el.appendChild(c)}
      function base(x){var o={autosize:true,symbol:"FX_IDC:USDKRW",timezone:"Asia/Seoul",theme:th,locale:"kr",allow_symbol_change:false,hide_side_toolbar:true,calendar:false,support_host:"https://www.tradingview.com"};for(var k in x)o[k]=x[k];return o}
      var R2="5D", made={};
      function build(m){
        if(m==="drag")tv("tv2drag","embed-widget-advanced-chart.js",base({interval:"1",style:"2"}));
        if(m==="range")tv("tv2range","embed-widget-advanced-chart.js",base({interval:R2==="1D"?"5":R2==="5D"?"15":"60",range:R2,style:"1",hide_top_toolbar:true}));
        if(m==="day")tv("tv2day","embed-widget-advanced-chart.js",base({interval:"1",range:"1D",style:"3",hide_top_toolbar:true,hide_legend:false,hide_volume:true}));
        made[m]=1}
      var radios=[].slice.call(document.querySelectorAll('input[name="rtmode2"]'));
      function show(m){[].forEach.call(document.querySelectorAll(".mp2"),function(p){p.hidden=p.getAttribute("data-mode")!==m});
        radios.forEach(function(r){r.checked=r.value===m});try{localStorage.setItem("fx2-mode",m)}catch(e){}
        if(!made[m])setTimeout(function(){build(m)},0)}
      radios.forEach(function(r){r.addEventListener("change",function(){if(r.checked)show(r.value)})});
      [].forEach.call(document.querySelectorAll("[data-r2]"),function(b){b.addEventListener("click",function(){R2=b.getAttribute("data-r2");
        [].forEach.call(document.querySelectorAll("[data-r2]"),function(x){x.setAttribute("aria-pressed",String(x===b))});build("range")})});
      var M="day";try{M=localStorage.getItem("fx2-mode")||"day"}catch(e){}
      tv("tv2quote","embed-widget-single-quote.js",{symbol:"FX_IDC:USDKRW",width:"100%",isTransparent:true,colorTheme:th,locale:"kr"});
      tv("tv2cal","embed-widget-events.js",{colorTheme:th,isTransparent:false,width:"100%",height:"100%",locale:"kr",importanceFilter:"0,1",countryFilter:"us,kr,jp,eu"});
      show(M);
    })();
    </script>
'''
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

    # ---------------- 4페이지: 자동 목록 화면은 그대로, 출처만 공식 기관 발표(v2/functions/api/news.js) ----------------
    a, b = cut(s, '  <main id="p4" data-page="4" hidden>', "  </main>")
    p4 = s[a:b]
    p4 = rep(p4, '<span class="eyebrow">4페이지</span><h2>환율 뉴스</h2>', '<span class="eyebrow">4페이지</span><h2>환율 뉴스 · 공식 발표</h2>')
    i = p4.index('<p class="muted small">연합뉴스 RSS에서 환율에 영향을')
    j = p4.index("</p>", i) + 4
    p4 = p4[:i] + ('<p class="muted small">한국은행·미 연준·유럽중앙은행(ECB)의 보도자료와 연설을 자동으로 모아 분류합니다. 제목과 원문 링크만 보여 주며, '
                   '언론 기사는 아래 링크로 각 언론사·포털에서 보세요. 화면을 열어 두면 1분마다 새 발표를 확인합니다.</p>') + p4[j:]
    i = p4.index("<li><b>분류 기준(키워드 자동 분류).</b>")
    j = p4.index("</li>", i) + 5
    p4 = p4[:i] + ("<li><b>분류 기준.</b> 긴급·속보 = 금리 결정·통화정책방향·FOMC 성명, 외환 시황 = 외환·국제수지·외환보유액, "
                   "영향 요인 = 물가·경기·금융안정·총재 연설 등. 최근 30일 발표.</li>") + p4[j:]
    p4 = p4.replace('<div class="pagefoot">', ad() + '\n    <div class="pagefoot">', 1)
    s = s[:a] + p4 + s[b:]
    s = rep(s, '" · 출처: 연합뉴스 RSS · 굵은 제목은 지난번 방문 이후 새 기사"', '" · 출처: 한국은행·미 연준·ECB 보도자료 RSS · 굵은 제목은 지난번 방문 이후 새 발표"')

    # 2페이지 끝 광고 자리
    a = s.index('<main id="p2"')
    pf = s.index('<div class="pagefoot">', a)
    s = s[:pf] + ad() + "\n    " + s[pf:]
    # 머리 아래 광고 자리
    s = s.replace("</header>", "</header>\n" + ad("상단 광고 영역"), 1)

    # ---- 상업 이용 점검(10/26): 로이터 포지션 설문·연합인포맥스 설문 인용, 원문 미확인 2차 출처(SNS·블로그) 줄 삭제 ----
    s, n1 = re.subn(r'\s*<li><b>포지션\.</b> 로이터 10/1 포지션 폴.*?</li>', '', s, count=1, flags=re.S)
    s = rep(s, '연준 9월 FOMC 인상, 미 10년물 5.2%대(<a href="https://kbthink.com/news-list/view.html?newsId=20260930080003794" target="_blank" rel="noopener">연합인포맥스 설문</a>). 10/5 장중 5.349%',
            '연준 9월 FOMC 인상, 미 10년물 10/5 장중 5.349%')
    s = re.sub(r'<a href="https://kbthink\.com[^"]*"[^>]*>설문[^<]*</a>\s*·\s*', '', s)
    s, n2 = re.subn(r'\s*<tr><td><span class="sw f"></span></td><td class="inst">JP모건</td><td class="date">2026-07-04</td>.*?</tr>', '', s, count=1, flags=re.S)
    s, n3 = re.subn(r'\s*<tr><td><span class="sw d"></span></td><td class="inst">KB국민·우리은행</td>.*?</tr>', '', s, count=1, flags=re.S)
    assert n1 == n2 == n3 == 1, (n1, n2, n3)

    # 아래쪽 안내
    s = rep(s, '<span>방문 통계를 위해 접속 IP·대략적 위치·브라우저 정보를 90일간 기록합니다(사이트 운영자만 열람).</span>',
            '<span>이 사이트에는 광고가 표시되며 광고 사업자가 쿠키를 사용할 수 있습니다 · <a href="/privacy.html">개인정보처리방침</a></span>')
    s = s.replace("실시간 시세: TradingView (FX_IDC:USDKRW)", "실시간 시세·경제 캘린더: TradingView 위젯 (FX_IDC:USDKRW)")
    s = s.replace("시세·뉴스는 자동 갱신", "시세는 TradingView 실시간")
    return s


# ================================================================== 금리 모니터 ver2
def build_rates():
    # 지금 금리 모니터 화면(뉴스 받은편지함 포함) 그대로, 뉴스 출처만 공식 기관 발표(v2 의 /rates/data/news.json)
    s = (RATE_REPO / "docs" / "index.html").read_text(encoding="utf-8")
    TXT = {
        "ko": ("한국은행·미 연준·유럽중앙은행(ECB)의 보도자료와 연설 가운데 금리 관련 발표를 자동으로 모읍니다. 제목·게시 시각·원문 링크만 보여 주며, 이 화면은 10분마다 새 발표를 확인합니다. 아래에는 언론사·포털로 가는 링크를 두었습니다.",
               "각 발표의 저작권은 해당 기관에 있습니다. 제목·시각·원문 링크만 보여 주며 본문은 옮기지 않습니다. 읽음 표시는 이 브라우저에만 저장됩니다. 단축키: j/k 또는 ↑/↓ 이동, Enter 원문 열기.",
               "데이터: 한국은행 ECOS Open API 817Y002(시장금리 일별), 722Y001(기준금리) — 공공데이터. 발표: 한국은행·미 연준·ECB 보도자료 RSS(제목·링크만)."),
        "en": ("Rate-related press releases and speeches from the Bank of Korea, the US Federal Reserve and the ECB, collected automatically. Only the title, posting time and a link to the original are shown; this page checks for new releases every 10 minutes. Links to publishers and portals are below.",
               "Copyright of each release belongs to the issuing institution. Only the title, time and a link to the original are shown. Read marks are stored only in this browser. Shortcuts: j/k or ↑/↓ to move, Enter to open the original.",
               "Data: Bank of Korea ECOS Open API 817Y002 (daily Korean market rates), 722Y001 (BOK base rate) — public data. Releases: Bank of Korea, Federal Reserve and ECB press-release RSS (titles and links only)."),
        "ja": ("韓国銀行・米連邦準備制度（FRB）・欧州中央銀行（ECB）の報道資料と講演のうち金利関連の発表を自動で集めます。タイトル・掲載時刻・原文リンクのみを表示し、この画面は10分ごとに新着を確認します。下に報道機関・ポータルへのリンクがあります。",
               "各発表の著作権は発表機関に帰属します。タイトル・時刻・原文リンクのみを表示し、本文は転載しません。既読の記録はこのブラウザにだけ保存されます。ショートカット：j/k または ↑/↓ で移動、Enter で原文を開く。",
               "データ：韓国銀行 ECOS Open API 817Y002（韓国市場金利・日次）、722Y001（韓国銀行 基準金利）— 公共データ。発表：韓国銀行・FRB・ECBの報道資料RSS（タイトルとリンクのみ）。"),
        "zh": ("自动收集韩国银行、美联储和欧洲央行（ECB）新闻稿与讲话中与利率相关的发布。仅显示标题、发布时间和原文链接，本页每10分钟检查一次新发布。下方提供媒体和门户网站链接。",
               "各发布的版权归发布机构所有。仅显示标题、时间和原文链接，不转载正文。已读记录仅保存在本浏览器中。快捷键：j/k 或 ↑/↓ 移动，Enter 打开原文。",
               "数据：韩国银行 ECOS Open API 817Y002（韩国市场利率·日度）、722Y001（韩国银行基准利率）— 公共数据。发布：韩国银行、美联储、ECB新闻稿RSS（仅标题和链接）。"),
    }
    blocks = [m.start() for m in re.finditer(r"\n    nlMore: ", s)]
    assert len(blocks) == 4, blocks
    order = ["ko", "en", "ja", "zh"]
    for idx in range(3, -1, -1):
        lede, note, foot = TXT[order[idx]]
        start = blocks[idx]
        end = blocks[idx + 1] if idx < 3 else s.index("\n  },", start)
        seg = s[start:end]
        for key, val in (("ledeNews", lede), ("noteNews", note), ("footer1", foot)):
            seg, n = re.subn(r'(\b' + key + r': )"(?:[^"\\]|\\.)*"', lambda m, v=val: m.group(1) + '"' + v + '"', seg, count=1)
            assert n == 1, (order[idx], key)
        s = s[:start] + seg + s[end:]
    s = s.replace("<head>", '<head>\n<meta name="robots" content="noindex,nofollow">', 1)
    i = s.index('<nav class="sitebar"')
    j = s.index("</script>\n", i) + len("</script>\n")
    s = s[:i] + s[i:j] + v2bar("/rates/") + s[j:]
    s = s.replace("<main>", "<main>\n" + ad("상단 광고 영역"), 1)
    s = s.replace("</section>\n</main>", "</section>\n" + ad() + "\n</main>", 1)
    s = s.replace('<span data-i18n="footer2">', '<span><a href="/privacy.html">개인정보처리방침</a> · 이 사이트에는 광고가 표시되며 광고 사업자가 쿠키를 사용할 수 있습니다.</span>\n  <span data-i18n="footer2">', 1)
    return s


# 개인정보처리방침 원문은 v2/privacy.html (개인정보 보호법 제30조·시행령 제31조·제28조의8 항목)
PRIVACY = (Path(__file__).resolve().parent / "privacy.html").read_text(encoding="utf-8")


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
