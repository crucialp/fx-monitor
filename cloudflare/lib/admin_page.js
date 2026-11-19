// 관리자 화면 HTML (비밀번호 입력 / 방문 통계). 방문 기록 값(브라우저 정보·들어온 주소 등)은 방문자가 보낸 것이라
// 화면에 넣을 때 반드시 textContent 로만 넣는다(HTML 로 해석되지 않게).

const HEAD = (title) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${title}</title>
<link rel="stylesheet" href="/fonts/pretendard/pretendardvariable-dynamic-subset.css">
<style>
:root{--bg:#f3f4f6;--surface:#fff;--ink:#16181d;--ink-2:#4a505c;--muted:#6b7280;--rule:#e3e5ea;--rule-strong:#c9cdd5;--accent:#1f4fd1;--me:#7a4fd6;--bad:#c4372f;
  --font-body:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif;--font-num:'Pretendard Variable',Pretendard,'Malgun Gothic',sans-serif}
@media (prefers-color-scheme:dark){:root{--bg:#121418;--surface:#1b1e24;--ink:#eceef2;--ink-2:#b4bac5;--muted:#8a919e;--rule:#2b2f37;--rule-strong:#3a3f49;--accent:#7ea2ff;--me:#a98cf2;--bad:#ec6a62}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-body);font-size:14px;line-height:1.5}
a{color:var(--accent)}
.wrap{max-width:1180px;margin:0 auto;padding:24px 16px 48px}
h1{font-size:24px;margin:0}
.muted{color:var(--muted)}
.num{font-family:var(--font-num)} body{font-variant-numeric:tabular-nums}
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
  return `${HEAD("방문 기록 · 환율 조회 · 금리 모니터")}
<style>
.top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:1px solid var(--rule);padding-bottom:14px}
.ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0 6px}
.sep{width:1px;height:22px;background:var(--rule-strong);margin:0 4px}
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0 18px}
.tile{background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:12px 14px;min-width:0}
.tile .k{font-size:13px;font-weight:600} .tile .v{font-family:var(--font-num);font-size:28px;font-weight:500;line-height:1.3}
.tile .s{font-size:12.5px;color:var(--muted)}
.tile.fx{border-top:3px solid var(--fx)} .tile.rt{border-top:3px solid var(--rt)} .tile.all{border-top:3px solid var(--ink-2)}
@media (max-width:640px){.tiles{grid-template-columns:1fr}}
h2{font-size:16px;margin:22px 0 8px}
.tbl{background:var(--surface);border:1px solid var(--rule);border-radius:8px;overflow-x:auto}
table{border-collapse:collapse;width:100%;min-width:640px}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--rule);white-space:nowrap;font-size:13px}
th{font-size:12px;color:var(--muted);font-weight:600;background:var(--bg)}
tr:last-child td{border-bottom:0}
td.n{font-family:var(--font-num);text-align:right} th.n{text-align:right}
td.ip{font-family:var(--font-num)}
td.fx{color:var(--fx);font-weight:600} td.rt{color:var(--rt);font-weight:600}
.me{display:inline-block;font-size:11px;color:#fff;background:var(--me);border-radius:4px;padding:0 5px;margin-left:6px;vertical-align:1px}
.bot{display:inline-block;font-size:11px;color:var(--ink-2);background:var(--bg);border:1px solid var(--rule-strong);border-radius:4px;padding:0 5px;margin-left:6px;vertical-align:1px}
tr.isbot td{color:var(--muted)}
.note{font-size:12.5px;color:var(--muted)}
.err{color:var(--bad);font-size:13px}
:root{--fx:#1f4fd1;--rt:#1a8a5a}
@media (prefers-color-scheme:dark){:root{--fx:#7ea2ff;--rt:#4fc98f}}
</style>
<body><div class="wrap">
<div class="top">
  <div><p class="muted" style="margin:0">관리자 전용 · 환율 조회 · 금리 모니터</p><h1>방문 기록</h1><p class="note" id="fxHealth" style="margin:4px 0 0"></p></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="/">환율 조회</a><a class="btn" href="/rates/">금리 모니터</a><a class="btn" href="/community/">커뮤니티</a><a class="btn" href="/community/?queue">신고·가림 목록</a><a class="btn" href="/admin/inquiries" id="inqBtn">문의·건의함</a><a class="btn" href="/admin/logout">로그아웃</a></div>
</div>
<div class="ctl" role="group" aria-label="기간">
  <button type="button" data-d="1">오늘</button><button type="button" data-d="7">7일</button><button type="button" data-d="30">30일</button><button type="button" data-d="90">90일</button>
  <span class="sep" aria-hidden="true"></span>
  <label><input type="checkbox" id="noMe" checked> 내 방문 빼기</label>
  <label><input type="checkbox" id="showBot" checked> 표에 봇 보기</label>
  <span class="note" id="upd"></span>
</div>
<p class="note" id="you"></p>
<p class="err" id="err" hidden></p>
<div class="tiles">
  <div class="tile fx"><div class="k">환율 조회</div><div class="v" id="fxN">–</div><div class="s" id="fxS"></div></div>
  <div class="tile rt"><div class="k">금리 모니터</div><div class="v" id="rtN">–</div><div class="s" id="rtS"></div></div>
  <div class="tile all"><div class="k">두 사이트 합계</div><div class="v" id="alN">–</div><div class="s" id="alS"></div></div>
</div>
<h2>날짜별 방문</h2><div class="tbl"><table id="daily"></table></div>
<div class="ctl" role="group" aria-label="사이트" style="margin-top:22px">
  <span class="note">아래 표:</span>
  <button type="button" data-s="all">두 사이트</button><button type="button" data-s="fx">환율 조회</button><button type="button" data-s="rate">금리 모니터</button>
</div>
<h2 style="margin-top:8px">IP별 <span class="note">(많이 온 순)</span></h2><div class="tbl"><table id="byip"></table></div>
<h2>최근 방문 <span class="note">(최대 500건)</span></h2><div class="tbl"><table id="recent"></table></div>
<p class="note" style="margin-top:18px">사이트를 한 번 열 때마다 1건(화면 안에서 페이지를 넘기거나 시세·금리가 갱신되는 것은 세지 않음). 위치·통신사는 IP로 추정한 값이라 실제와 다를 수 있습니다.
'내 방문 빼기' — 이 관리자 화면에 로그인한 브라우저로 연 것만 뺍니다. 단, 금리 모니터를 환율 조회 주소(/rates/)로 합치기 전(10/26)의 금리 모니터 기록은 그런 표시가 없어 지금 내 IP와 같은 기록을 뺍니다.
환율 조회의 '방문자'는 브라우저마다 붙는 임의 번호 기준입니다. 자동 접속(봇·스캐너 이름, 위장된 브라우저 정보, AWS·Google 같은 데이터센터 회선)은 두 사이트 모두 같은 규칙으로 가려 방문 수에서는 빼고, 표에는 '봇' 표시를 붙여 보여 줍니다(흐린 글씨, '표에 봇 보기'를 끄면 숨김). 기록은 두 사이트 모두 90일 뒤 지워집니다.</p>
</div>
<script>
(function(){
  try{localStorage.setItem("fx-owner","1")}catch(e){}   /* 이 브라우저에서 환율 조회를 열면 '나'로 표시 */
  var D=7, S="all";
  try{D=+localStorage.getItem("fx-adm-d")||7; S=localStorage.getItem("fx-adm-s")||"all"}catch(e){}
  var $=function(id){return document.getElementById(id)}, J=null;
  var NAME={fx:"환율 조회",rate:"금리 모니터"};
  function pad(n){return (n<10?"0":"")+n}
  function k(ts){var d=new Date(ts+9*3600e3);return (d.getUTCMonth()+1)+"/"+d.getUTCDate()+" "+pad(d.getUTCHours())+":"+pad(d.getUTCMinutes())}
  var CN={KR:"한국",US:"미국",JP:"일본",CN:"중국",HK:"홍콩",SG:"싱가포르",TW:"대만",GB:"영국",DE:"독일",FR:"프랑스",VN:"베트남",AU:"호주",CA:"캐나다"};
  function place(r){var c=r.country?(CN[r.country]||r.country):"";return [c,r.city].filter(Boolean).join(" ")||"–"}
  function dev(ua){ua=ua||"";
    var m=/iPhone|Android.*Mobile|Mobile/.test(ua)?"모바일":/iPad|Tablet|Android/.test(ua)?"태블릿":"PC";
    var os=/Windows/.test(ua)?"Windows":/iPhone|iPad|iPod/.test(ua)?"iOS":/Android/.test(ua)?"Android":/Mac OS X/.test(ua)?"Mac":/Linux/.test(ua)?"Linux":"";
    var br=/KAKAOTALK/i.test(ua)?"카카오톡":/NAVER/.test(ua)?"네이버앱":/Whale/.test(ua)?"웨일":/SamsungBrowser/.test(ua)?"삼성 인터넷":/Edg\\//.test(ua)?"Edge":/OPR\\//.test(ua)?"Opera":/Firefox/.test(ua)?"Firefox":/Chrome\\//.test(ua)?"Chrome":/Safari\\//.test(ua)?"Safari":"기타";
    return [m,os,br].filter(Boolean).join(" · ")}
  function from(ref){if(!ref)return "직접(주소·즐겨찾기)";try{return new URL(ref).hostname}catch(e){return String(ref).slice(0,40)}}
  function addr(r){var q=r.query?String(r.query):"";if(q&&q.charAt(0)!=="?")q="?"+q;return (r.host||"")+q}
  function table(el,head,rows){
    el.textContent="";
    var tr=document.createElement("tr");
    head.forEach(function(h){var th=document.createElement("th");th.textContent=h[0];if(h[1])th.className=h[1];tr.appendChild(th)});
    el.appendChild(tr);
    if(!rows.length){var r0=document.createElement("tr"),td0=document.createElement("td");td0.colSpan=head.length;td0.className="note";td0.textContent="기록이 없습니다.";r0.appendChild(td0);el.appendChild(r0);return}
    rows.forEach(function(cells){
      var r=document.createElement("tr");
      cells.forEach(function(c){var td=document.createElement("td");td.textContent=c.t==null?"–":String(c.t);if(c.c)td.className=c.c;
        if(c.me){var s=document.createElement("span");s.className="me";s.textContent="나";td.appendChild(s)}
        if(c.bot){var b=document.createElement("span");b.className="bot";b.textContent="봇";td.appendChild(b);r.className="isbot"}
        r.appendChild(td)});
      el.appendChild(r)});
  }
  function ok(x){return x&&!x.error&&x.total}
  function z(v){return v==null?0:v}
  function render(){
    if(!J)return;
    [].forEach.call(document.querySelectorAll("[data-d]"),function(b){b.setAttribute("aria-pressed",String(+b.dataset.d===D))});
    [].forEach.call(document.querySelectorAll("[data-s]"),function(b){b.setAttribute("aria-pressed",String(b.dataset.s===S))});
    var fx=J.sites.fx, rt=J.sites.rate, errs=[];
    if(fx&&fx.error)errs.push("환율 조회 기록: "+fx.error); if(rt&&rt.error)errs.push("금리 모니터 기록: "+rt.error);
    if(!fx)errs.push("환율 조회 기록 DB 가 연결되지 않았습니다"); if(!rt)errs.push("금리 모니터 기록 DB 가 연결되지 않았습니다");
    $("err").hidden=!errs.length; $("err").textContent=errs.join(" · ");
    var F=ok(fx)?fx:{total:{},allTime:{},daily:[],byIp:[],recent:[]}, R=ok(rt)?rt:{total:{},allTime:{},daily:[],byIp:[],recent:[]};
    var SB=$("showBot").checked;
    $("fxN").textContent=z(F.total.n); $("fxS").textContent="IP "+z(F.total.ips)+" · 방문자 "+z(F.total.vids)+" · 전체 누적 "+z(F.allTime.n)+" · 봇 "+z(F.total.bots)+"건 별도";
    $("rtN").textContent=z(R.total.n); $("rtS").textContent="IP "+z(R.total.ips)+" · 전체 누적 "+z(R.allTime.n)+" · 봇 "+z(R.total.bots)+"건 별도";
    var ipset={}; F.byIp.concat(R.byIp).forEach(function(r){if(!r.bot)ipset[r.ip]=1});
    $("alN").textContent=z(F.total.n)+z(R.total.n); $("alS").textContent="IP "+Object.keys(ipset).length+"(두 사이트 중복 제외) · 전체 누적 "+(z(F.allTime.n)+z(R.allTime.n))+" · 봇 "+(z(F.total.bots)+z(R.total.bots))+"건 별도";
    /* 날짜별: 두 사이트를 날짜로 합침 */
    var dm={}; F.daily.forEach(function(r){(dm[r.d]=dm[r.d]||{}).f=r}); R.daily.forEach(function(r){(dm[r.d]=dm[r.d]||{}).r=r});
    table($("daily"),[["날짜"],["환율 조회","n"],["IP","n"],["금리 모니터","n"],["IP","n"],["합계","n"],["봇(별도)","n"]],
      Object.keys(dm).sort().reverse().map(function(d){var f=dm[d].f||{}, r=dm[d].r||{};
        return [{t:d},{t:z(f.n),c:"n"},{t:z(f.ips),c:"n"},{t:z(r.n),c:"n"},{t:z(r.ips),c:"n"},{t:z(f.n)+z(r.n),c:"n"},{t:z(f.bots)+z(r.bots),c:"n"}]}));
    /* IP별: 같은 IP를 합치고 사이트별 횟수 */
    var im={};
    function addIp(r,key){var o=im[r.ip]||(im[r.ip]={ip:r.ip,fx:0,rate:0,first:r.first,last:r.last,country:r.country,city:r.city,org:r.org,ua:r.ua,me:0,bot:1});
      if(!r.bot)o.bot=0;
      o[key]+=r.n; if(r.first<o.first)o.first=r.first; if(r.last>o.last){o.last=r.last;o.ua=r.ua||o.ua} o.country=o.country||r.country; o.city=o.city||r.city; o.org=o.org||r.org; if(r.me)o.me=1}
    F.byIp.forEach(function(r){addIp(r,"fx")}); R.byIp.forEach(function(r){addIp(r,"rate")});
    var ips=Object.keys(im).map(function(x){return im[x]}).filter(function(o){return (S==="all"||o[S]>0)&&(SB||!o.bot)})
      .sort(function(a,b){var na=S==="all"?a.fx+a.rate:a[S], nb=S==="all"?b.fx+b.rate:b[S]; return a.bot-b.bot||nb-na||b.last-a.last});   /* 사람 먼저, 봇은 아래 */
    table($("byip"),[["IP"],["환율 조회","n"],["금리 모니터","n"],["합계","n"],["처음"],["마지막"],["위치"],["통신사·기관"],["기기"]],
      ips.map(function(o){return [{t:o.ip,c:"ip",me:o.me,bot:o.bot},{t:o.fx,c:"n"},{t:o.rate,c:"n"},{t:o.fx+o.rate,c:"n"},{t:k(o.first)},{t:k(o.last)},{t:place(o)},{t:o.org},{t:dev(o.ua)}]}));
    /* 최근 방문: 두 사이트를 시각순으로 */
    var rec=[];
    if(S!=="rate")F.recent.forEach(function(r){if(SB||!r.bot)rec.push({s:"fx",r:r})});
    if(S!=="fx")R.recent.forEach(function(r){if(SB||!r.bot)rec.push({s:"rate",r:r})});
    rec.sort(function(a,b){return b.r.ts-a.r.ts}); rec=rec.slice(0,500);
    table($("recent"),[["시각"],["사이트"],["IP"],["위치"],["통신사·기관"],["기기"],["들어온 곳"],["주소"]],
      rec.map(function(x){var r=x.r;return [{t:k(r.ts)},{t:NAME[x.s],c:x.s==="fx"?"fx":"rt"},{t:r.ip,c:"ip",me:r.me,bot:r.bot},{t:place(r)},{t:r.org},{t:dev(r.ua)},{t:from(r.ref)},{t:addr(r)}]}));
  }
  function load(){
    var noMe=$("noMe").checked;
    fetch("/api/admin/stats?days="+D+"&me="+(noMe?0:1),{cache:"no-store",credentials:"same-origin"})
      .then(function(r){if(r.status===401){location.href="/admin";throw 0}return r.json()})
      .then(function(j){
        if(j.error){$("upd").textContent=j.error;return}
        J=j;
        $("you").textContent="지금 내 IP: "+(j.you||"–")+" · 이 브라우저에서 연 환율 조회·금리 모니터는 '나'로 표시됩니다.";
        $("upd").textContent="갱신 "+k(j.now);
        render();
      }).catch(function(e){if(e!==0)$("upd").textContent="불러오지 못했습니다. 새로고침해 주세요."});
  }
  [].forEach.call(document.querySelectorAll("[data-d]"),function(b){b.addEventListener("click",function(){D=+b.dataset.d;try{localStorage.setItem("fx-adm-d",String(D))}catch(e){}load()})});
  [].forEach.call(document.querySelectorAll("[data-s]"),function(b){b.addEventListener("click",function(){S=b.dataset.s;try{localStorage.setItem("fx-adm-s",S)}catch(e){}render()})});
  $("noMe").addEventListener("change",load);
  try{if(localStorage.getItem("fx-adm-bot")==="0")$("showBot").checked=false}catch(e){}
  $("showBot").addEventListener("change",function(){try{localStorage.setItem("fx-adm-bot",$("showBot").checked?"1":"0")}catch(e){}render()});
  load(); setInterval(function(){if(!document.hidden)load()},60000);
  /* 문의함 버튼에 새 문의 개수 */
  function inq(){fetch("/api/contact/admin/count",{cache:"no-store",credentials:"same-origin"}).then(function(r){return r.json()}).then(function(j){
    var b=$("inqBtn"); b.textContent=j&&j.new?"문의·건의함 · 새 "+j.new+"건":"문의·건의함"; b.style.fontWeight=j&&j.new?"600":""}).catch(function(){})}
  inq(); setInterval(function(){if(!document.hidden)inq()},60000);
  /* 시세 상태: Yahoo 1분 시세와 예비 기록(backup-worker, Wise 1분)이 제때 들어오는지 */
  function health(){fetch("/api/intraday",{cache:"no-store"}).then(function(r){return r.json()}).then(function(j){
    var now=Date.now()/60000, t=j.m1.t, W={}, i, y=null;
    (j.m1.w||[]).forEach(function(r){for(var q=r[0];q<=r[1];q++)W[q]=1});
    for(i=t.length-1;i>=0;i--)if(!W[i]){y=t[i];break}
    var b=j.backup||{}, ago=function(m){return m==null?"없음":Math.round(now-m)+"분 전"}, bad=b.last==null||now-b.last>5;
    var e=$("fxHealth"); e.textContent="시세 상태 · Yahoo 마지막 1분 시세 "+ago(y)+" · 예비 기록(Wise 1분, backup-worker) 마지막 "+ago(b.last)+" (최근 72시간 "+(b.n||0)+"건)"+(bad?" — 예비 기록이 멈춤, 확인 필요":"");
    e.style.color=bad?"var(--bad)":""}).catch(function(){})}
  health(); setInterval(function(){if(!document.hidden)health()},60000);
})();
</script>
</body></html>`;
}

// 문의함(/admin/inquiries): /contact/ 로 들어온 문의(본 사이트·ver2). 문의 글은 방문자가 쓴 것이라 반드시 textContent 로만 넣는다.
export function inqPage() {
  return `${HEAD("문의·건의함 · 환율 조회")}
<style>
.top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:12px;border-bottom:1px solid var(--rule);padding-bottom:14px}
.ctl{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:16px 0 12px}
.note{font-size:12.5px;color:var(--muted)}
.err{color:var(--bad);font-size:13px}
.list{display:grid;gap:10px}
.q{background:var(--surface);border:1px solid var(--rule);border-radius:8px;padding:14px 16px;display:grid;gap:8px}
.q.new{border-left:4px solid var(--accent)}
.q.done{opacity:.7}
.q .meta{font-size:12.5px;color:var(--muted);display:flex;flex-wrap:wrap;gap:2px 10px;align-items:center}
.q .st{font-size:11.5px;border:1px solid var(--rule-strong);border-radius:999px;padding:0 8px;color:var(--ink-2)}
.q.new .st{border-color:var(--accent);color:var(--accent);font-weight:600}
.q h3{margin:0;font-size:16px;line-height:1.45;overflow-wrap:anywhere}
.q .body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.65;color:var(--ink)}
.q .who{font-size:13px;color:var(--ink-2);display:flex;flex-wrap:wrap;gap:2px 14px}
.q .act{display:flex;flex-wrap:wrap;gap:6px}
.q .act button{font-size:12.5px;padding:3px 11px}
.q .act .del{color:var(--bad)}
.ip{font-family:ui-monospace,Consolas,monospace;font-size:12px}
.empty{padding:30px;text-align:center;color:var(--muted);background:var(--surface);border:1px solid var(--rule);border-radius:8px}
[hidden]{display:none!important}
</style>
<body><div class="wrap">
<div class="top">
  <div><p class="muted" style="margin:0">관리자 전용 · 환율 조회 · 금리 모니터</p><h1>문의·건의함</h1></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="/admin">방문 기록</a><a class="btn" href="/contact/">문의 화면</a><a class="btn" href="/admin/logout">로그아웃</a></div>
</div>
<div class="ctl" role="group" aria-label="보기">
  <button type="button" data-st="open">처리 전</button><button type="button" data-st="new">새 문의</button><button type="button" data-st="done">처리 완료</button><button type="button" data-st="all">전체</button>
  <span class="note" id="cnt"></span>
</div>
<p class="err" id="err" hidden></p>
<div class="list" id="list"><div class="empty">불러오는 중…</div></div>
<p style="text-align:center;margin-top:14px"><button type="button" id="more" hidden>더 보기</button></p>
<p class="note" style="margin-top:18px">/contact/ 에서 보낸 문의입니다(본 사이트·ver2 함께). 접속 IP·브라우저 정보는 90일, 문의 자체는 1년 뒤 자동으로 지워집니다. 답장은 이메일을 적은 문의에만 '메일 쓰기'로 직접 보냅니다.</p>
</div>
<script>
(function(){
  var $=function(id){return document.getElementById(id)}, ST="open", OFF=0;
  try{ST=localStorage.getItem("fx-inq-st")||"open"}catch(e){}
  var STN=["새 문의","읽음","처리 완료"], SITE={fx:"본 사이트",v2:"ver2"};
  function pad(n){return (n<10?"0":"")+n}
  function k(ts){var d=new Date(ts+9*3600e3);return d.getUTCFullYear()+"-"+pad(d.getUTCMonth()+1)+"-"+pad(d.getUTCDate())+" "+pad(d.getUTCHours())+":"+pad(d.getUTCMinutes())}
  function dev(ua){ua=ua||"";var m=/iPhone|Android.*Mobile|Mobile/.test(ua)?"모바일":/iPad|Tablet|Android/.test(ua)?"태블릿":"PC";
    var os=/Windows/.test(ua)?"Windows":/iPhone|iPad|iPod/.test(ua)?"iOS":/Android/.test(ua)?"Android":/Mac OS X/.test(ua)?"Mac":/Linux/.test(ua)?"Linux":"";return [m,os].filter(Boolean).join(" · ")}
  function el(tag,cls,txt,p){var e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;if(p)p.appendChild(e);return e}
  function btns(){[].forEach.call(document.querySelectorAll("[data-st]"),function(b){b.setAttribute("aria-pressed",String(b.dataset.st===ST))})}
  function act(id,action){
    if(action==="delete"&&!confirm("문의 "+id+"번을 지울까요? 되돌릴 수 없습니다."))return;
    fetch("/api/contact/admin",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({id:id,action:action})})
      .then(function(r){if(r.status===401){location.href="/admin";throw 0}return r.json()}).then(function(j){if(j.error){alert(j.error);return}load(true)}).catch(function(){});
  }
  function card(x){
    var q=el("article","q"+(x.status===0?" new":x.status===2?" done":""));
    var m=el("div","meta",null,q);
    el("span","st",STN[x.status]||"",m); el("span",null,"#"+x.id,m); el("span",null,k(x.created),m); el("span",null,SITE[x.site]||x.site,m); el("span",null,x.kind,m);
    el("h3",null,x.title,q);
    el("div","body",x.body,q);
    var w=el("div","who",null,q);
    el("span",null,"이름: "+(x.name||"–"),w);
    var em=el("span",null,"이메일: ",w);
    if(x.email&&/^[^\\s@]+@[^\\s@]+$/.test(x.email)){var a=el("a",null,x.email,em);var at=x.email.lastIndexOf("@");
      a.href="mailto:"+encodeURIComponent(x.email.slice(0,at))+"@"+encodeURIComponent(x.email.slice(at+1))+"?subject="+encodeURIComponent("Re: "+x.title)}else em.appendChild(document.createTextNode("–"));
    if(x.ip){var ip=el("span",null,"IP ",w);el("span","ip",x.ip,ip)}
    if(x.ua)el("span",null,dev(x.ua),w);
    var b=el("div","act",null,q);
    if(x.status===0)el("button",null,"읽음 표시",b).onclick=function(){act(x.id,"read")};
    else el("button",null,"새 문의로",b).onclick=function(){act(x.id,"new")};
    if(x.status!==2)el("button",null,"처리 완료",b).onclick=function(){act(x.id,"done")};
    if(x.email){var r=el("button",null,"메일 쓰기",b);r.onclick=function(){var a2=q.querySelector(".who a");if(a2)a2.click();if(x.status===0)act(x.id,"read")}}
    el("button","del","지우기",b).onclick=function(){act(x.id,"delete")};
    return q;
  }
  function load(reset){
    if(reset)OFF=0;
    fetch("/api/contact/admin?st="+ST+"&off="+OFF,{cache:"no-store",credentials:"same-origin"})
      .then(function(r){if(r.status===401){location.href="/admin";throw 0}return r.json()})
      .then(function(j){
        if(j.error){$("err").hidden=false;$("err").textContent=j.error;return}
        $("err").hidden=true;
        var L=$("list"); if(OFF===0)L.textContent="";
        j.items.forEach(function(x){L.appendChild(card(x))});
        if(!L.children.length)el("div","empty","해당하는 문의가 없습니다.",L);
        OFF+=j.items.length; $("more").hidden=!j.more;
        var c=j.counts; $("cnt").textContent="새 문의 "+c.new+" · 읽음 "+c.read+" · 처리 완료 "+c.done;
        document.title=(c.new?"("+c.new+") ":"")+"문의·건의함 · 환율 조회";
      }).catch(function(e){if(e!==0){$("err").hidden=false;$("err").textContent="불러오지 못했습니다."}});
  }
  [].forEach.call(document.querySelectorAll("[data-st]"),function(b){b.addEventListener("click",function(){ST=b.dataset.st;try{localStorage.setItem("fx-inq-st",ST)}catch(e){}btns();load(true)})});
  $("more").addEventListener("click",function(){load(false)});
  btns(); load(true); setInterval(function(){if(!document.hidden&&OFF<=50)load(true)},60000);
})();
</script>
</body></html>`;
}
