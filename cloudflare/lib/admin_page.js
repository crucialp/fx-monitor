// 관리자 화면 HTML (비밀번호 입력 / 방문 통계). 방문 기록 값(브라우저 정보·들어온 주소 등)은 방문자가 보낸 것이라
// 화면에 넣을 때 반드시 textContent 로만 넣는다(HTML 로 해석되지 않게).

const HEAD = (title) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+KR:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--bg:#f3f4f6;--surface:#fff;--ink:#16181d;--ink-2:#4a505c;--muted:#6b7280;--rule:#e3e5ea;--rule-strong:#c9cdd5;--accent:#1f4fd1;--me:#7a4fd6;--bad:#c4372f;
  --font-body:'IBM Plex Sans KR','Malgun Gothic',sans-serif;--font-num:'IBM Plex Mono',ui-monospace,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#121418;--surface:#1b1e24;--ink:#eceef2;--ink-2:#b4bac5;--muted:#8a919e;--rule:#2b2f37;--rule-strong:#3a3f49;--accent:#7ea2ff;--me:#a98cf2;--bad:#ec6a62}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-body);font-size:14px;line-height:1.5}
a{color:var(--accent)}
.wrap{max-width:1180px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:24px;margin:0}
.muted{color:var(--muted)}
.num{font-family:var(--font-num)}
button,.btn{font:inherit;border:1px solid var(--rule-strong);background:var(--surface);color:var(--ink);border-radius:999px;padding:6px 14px;cursor:pointer;text-decoration:none;display:inline-block}
button[aria-pressed=true]{background:var(--ink);color:var(--surface);border-color:var(--ink)}
input[type=password]{font:inherit;width:100%;padding:10px 12px;border:1px solid var(--rule-strong);border-radius:6px;background:var(--surface);color:var(--ink)}
</style></head>`;

export function loginPage(msg) {
  const m = msg ? `<p style="color:var(--bad);margin:0 0 12px">${msg}</p>` : "";
  return `${HEAD("관리자 · 환율 조회")}
<body><div class="wrap" style="max-width:380px;padding-top:12vh">
<p class="muted" style="margin:0 0 4px">환율 조회</p><h1 style="margin-bottom:18px">관리자 로그인</h1>
${m}<form method="post" action="/admin/login">
<label for="pw" class="muted" style="display:block;margin-bottom:6px">비밀번호</label>
<input id="pw" name="pw" type="password" autocomplete="current-password" required autofocus>
<button type="submit" style="margin-top:14px;width:100%;border-radius:6px;padding:10px;background:var(--ink);color:var(--surface);border-color:var(--ink)">들어가기</button>
</form>
<p class="muted" style="margin-top:18px;font-size:12.5px">한 번 들어가면 이 브라우저에서는 30일 동안 다시 묻지 않습니다.</p>
</div></body></html>`;
}

export function dashPage() {
  return `${HEAD("방문 기록 · 환율 조회")}
<style>
.top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:1px solid var(--rule);padding-bottom:14px}
.ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0}
.tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:8px 0 18px}
.tile{background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:12px 14px;min-width:0}
.tile .k{font-size:12.5px;color:var(--muted)} .tile .v{font-family:var(--font-num);font-size:26px;font-weight:500}
@media (max-width:640px){.tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}
h2{font-size:16px;margin:22px 0 8px}
.tbl{background:var(--surface);border:1px solid var(--rule);border-radius:8px;overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:640px}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--rule);white-space:nowrap;font-size:13px}
th{font-size:12px;color:var(--muted);font-weight:600;background:var(--bg)}
tr:last-child td{border-bottom:0}
td.n{font-family:var(--font-num);text-align:right} th.n{text-align:right}
td.ip{font-family:var(--font-num)}
.me{display:inline-block;font-size:11px;color:#fff;background:var(--me);border-radius:4px;padding:0 5px;margin-left:6px;vertical-align:1px}
.note{font-size:12.5px;color:var(--muted)}
</style>
<body><div class="wrap">
<div class="top">
  <div><p class="muted" style="margin:0">환율 조회 · 관리자 전용</p><h1>방문 기록</h1></div>
  <div style="display:flex;gap:8px"><a class="btn" href="/">사이트로</a><a class="btn" href="/admin/logout">로그아웃</a></div>
</div>
<div class="ctl" role="group" aria-label="기간">
  <button type="button" data-d="1">오늘</button><button type="button" data-d="7">7일</button><button type="button" data-d="30">30일</button><button type="button" data-d="90">90일</button>
  <label style="margin-left:6px"><input type="checkbox" id="noMe" checked> 내 방문 빼기</label>
  <span class="note" id="upd"></span>
</div>
<p class="note" id="you"></p>
<div class="tiles">
  <div class="tile"><div class="k">방문 수 (사이트 열람)</div><div class="v" id="tN">–</div></div>
  <div class="tile"><div class="k">방문자 (브라우저 기준)</div><div class="v" id="tV">–</div></div>
  <div class="tile"><div class="k">IP 수</div><div class="v" id="tI">–</div></div>
  <div class="tile"><div class="k">전체 누적 방문</div><div class="v" id="tA">–</div></div>
</div>
<h2>날짜별</h2><div class="tbl"><table id="daily"></table></div>
<h2>IP별 <span class="note">(많이 온 순)</span></h2><div class="tbl"><table id="byip"></table></div>
<h2>최근 방문 <span class="note">(최대 500건)</span></h2><div class="tbl"><table id="recent"></table></div>
<p class="note" style="margin-top:18px">한 번 사이트를 열 때마다 1건(화면 안에서 페이지를 넘기거나 시세가 갱신되는 것은 세지 않음). 위치·통신사는 IP로 추정한 값이라 실제와 다를 수 있습니다.
'방문자'는 브라우저마다 붙는 임의 번호 기준이라, 같은 사람이 PC와 휴대폰으로 오면 2명으로 셉니다. 기록은 90일 뒤 지워집니다. 자동 접속(헤드리스 브라우저 등)은 기록하지 않습니다.</p>
</div>
<script>
(function(){
  try{localStorage.setItem("fx-owner","1")}catch(e){}   /* 이 브라우저에서 사이트를 열면 '내 방문'으로 표시 */
  var D=7; try{D=+localStorage.getItem("fx-adm-d")||7}catch(e){}
  var $=function(id){return document.getElementById(id)};
  function pad(n){return (n<10?"0":"")+n}
  function k(ts){var d=new Date(ts+9*3600e3);return (d.getUTCMonth()+1)+"/"+d.getUTCDate()+" "+pad(d.getUTCHours())+":"+pad(d.getUTCMinutes())}
  var CN={KR:"한국",US:"미국",JP:"일본",CN:"중국",HK:"홍콩",SG:"싱가포르",TW:"대만",GB:"영국",DE:"독일",FR:"프랑스",VN:"베트남",AU:"호주",CA:"캐나다"};
  function place(r){var c=r.country?(CN[r.country]||r.country):"";return [c,r.city].filter(Boolean).join(" ")||"–"}
  function dev(ua){ua=ua||"";
    var m=/iPhone|Android.*Mobile|Mobile/.test(ua)?"모바일":/iPad|Tablet|Android/.test(ua)?"태블릿":"PC";
    var os=/Windows/.test(ua)?"Windows":/iPhone|iPad|iPod/.test(ua)?"iOS":/Android/.test(ua)?"Android":/Mac OS X/.test(ua)?"Mac":/Linux/.test(ua)?"Linux":"";
    var br=/KAKAOTALK/i.test(ua)?"카카오톡":/NAVER/.test(ua)?"네이버앱":/Whale/.test(ua)?"웨일":/SamsungBrowser/.test(ua)?"삼성 인터넷":/Edg\\//.test(ua)?"Edge":/OPR\\//.test(ua)?"Opera":/Firefox/.test(ua)?"Firefox":/Chrome\\//.test(ua)?"Chrome":/Safari\\//.test(ua)?"Safari":"기타";
    return [m,os,br].filter(Boolean).join(" · ")}
  function from(ref){if(!ref)return "직접(주소·즐겨찾기)";try{var h=new URL(ref).hostname;return h}catch(e){return ref.slice(0,40)}}
  function table(el,head,rows){
    el.textContent="";
    var tr=document.createElement("tr");
    head.forEach(function(h){var th=document.createElement("th");th.textContent=h[0];if(h[1])th.className=h[1];tr.appendChild(th)});
    el.appendChild(tr);
    if(!rows.length){var r0=document.createElement("tr"),td0=document.createElement("td");td0.colSpan=head.length;td0.className="note";td0.textContent="기록이 없습니다.";r0.appendChild(td0);el.appendChild(r0);return}
    rows.forEach(function(cells){
      var r=document.createElement("tr");
      cells.forEach(function(c,i){var td=document.createElement("td");td.textContent=c.t==null?"–":String(c.t);if(c.c)td.className=c.c;
        if(c.me){var s=document.createElement("span");s.className="me";s.textContent="나";td.appendChild(s)}
        r.appendChild(td)});
      el.appendChild(r)});
  }
  function load(){
    [].forEach.call(document.querySelectorAll("[data-d]"),function(b){b.setAttribute("aria-pressed",String(+b.dataset.d===D))});
    var noMe=$("noMe").checked;
    fetch("/api/admin/stats?days="+D+"&me="+(noMe?0:1),{cache:"no-store",credentials:"same-origin"})
      .then(function(r){if(r.status===401){location.href="/admin";throw 0}return r.json()})
      .then(function(j){
        if(j.error){$("upd").textContent=j.error;return}
        $("you").textContent="지금 내 IP: "+(j.you||"–")+" · 이 브라우저에서 연 사이트는 '나'로 표시됩니다.";
        $("tN").textContent=j.total.n; $("tV").textContent=j.total.vids; $("tI").textContent=j.total.ips;
        $("tA").textContent=j.allTime.n+(j.allTime.first?"":"");
        $("upd").textContent="갱신 "+k(j.now)+(j.allTime.first?" · 기록 시작 "+k(j.allTime.first):"");
        table($("daily"),[["날짜"],["방문","n"],["방문자","n"],["IP","n"]],j.daily.map(function(r){return [{t:r.d},{t:r.n,c:"n"},{t:r.vids,c:"n"},{t:r.ips,c:"n"}]}));
        table($("byip"),[["IP"],["방문","n"],["브라우저","n"],["처음"],["마지막"],["위치"],["통신사·기관"],["기기"]],
          j.byIp.map(function(r){return [{t:r.ip,c:"ip",me:r.me},{t:r.n,c:"n"},{t:r.vids,c:"n"},{t:k(r.first)},{t:k(r.last)},{t:place(r)},{t:r.org},{t:dev(r.ua)}]}));
        table($("recent"),[["시각"],["IP"],["위치"],["통신사·기관"],["기기"],["들어온 곳"],["주소"]],
          j.recent.map(function(r){return [{t:k(r.ts)},{t:r.ip,c:"ip",me:r.me},{t:place(r)},{t:r.org},{t:dev(r.ua)},{t:from(r.ref)},{t:r.host}]}));
      }).catch(function(e){if(e!==0)$("upd").textContent="불러오지 못했습니다. 새로고침해 주세요."});
  }
  [].forEach.call(document.querySelectorAll("[data-d]"),function(b){b.addEventListener("click",function(){D=+b.dataset.d;try{localStorage.setItem("fx-adm-d",String(D))}catch(e){}load()})});
  $("noMe").addEventListener("change",load);
  load(); setInterval(function(){if(!document.hidden)load()},60000);
})();
</script>
</body></html>`;
}
