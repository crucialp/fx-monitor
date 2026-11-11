// 커뮤니티 화면 동작. 보안 정책(CSP: script-src 'self')으로 이 파일 말고는 어떤 스크립트도 실행되지 않는다 — public/_headers
(function(){
  "use strict";
  var $=function(id){return document.getElementById(id)};
  var CATS=["환율","금리","자유","질문"], BASE="/community/", TITLE="커뮤니티", PAGE=30;
  var ME={admin:false};
  var S={cat:"",q:"",sort:"new",unread:false,items:[],notices:[],counts:{},stats:null,queue:0,more:false,loaded:false,sel:0,mode:""};

  function el(tag,attrs){
    var e=document.createElement(tag);
    if(attrs)for(var k in attrs){var v=attrs[k];if(v==null||v===false)continue;
      if(k==="class")e.className=v;else if(k.slice(0,2)==="on")e.addEventListener(k.slice(2),v);else e.setAttribute(k,v===true?"":v)}
    for(var i=2;i<arguments.length;i++)add(e,arguments[i]);
    return e;
  }
  function add(e,c){if(c==null||c===false)return;if(Array.isArray(c)){c.forEach(function(x){add(e,x)});return}e.append(c.nodeType?c:document.createTextNode(String(c)))}
  function sep(){return el("span",{"aria-hidden":"true"},"·")}

  /* 시각(한국 시간) */
  var F=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",weekday:"short",hourCycle:"h23"});
  function parts(ms){var o={};F.formatToParts(new Date(ms)).forEach(function(p){o[p.type]=p.value});return o}
  function ymd(ms){var a=parts(ms);return a.year+a.month+a.day}
  function full(ms){var a=parts(ms);return a.year+"-"+a.month+"-"+a.day+" ("+a.weekday+") "+a.hour+":"+a.minute}
  function short(ms){var a=parts(ms),b=parts(Date.now());if(a.year===b.year)return (+a.month)+"/"+(+a.day)+" "+a.hour+":"+a.minute;return a.year+"-"+a.month+"-"+a.day}
  function rel(ms){var d=(Date.now()-ms)/60000;if(d<1)return "방금";if(d<60)return Math.floor(d)+"분 전";if(d<1440)return Math.floor(d/60)+"시간 전";return short(ms)}
  function dayLabel(ms){var a=parts(ms),base=(+a.month)+"월 "+(+a.day)+"일 ("+a.weekday+")",k=ymd(ms);
    return k===ymd(Date.now())?["오늘",base]:k===ymd(Date.now()-864e5)?["어제",base]:[base,""]}

  /* 읽음 기록(이 브라우저에만) — 환율 뉴스와 같은 방식: 처음 오면 최근 7일 글만 '안 읽음' */
  function ls(k,v){try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){return null}}
  var SEEN={},WM=+ls("fx-com-wm")||0;
  (ls("fx-com-seen")||"").split(",").forEach(function(k){if(k)SEEN[k]=1});
  if(!WM){WM=Date.now()-7*864e5;ls("fx-com-wm",String(WM))}
  function unread(x){return x.created>WM&&!SEEN[x.id]}
  function markSeen(id){if(SEEN[id])return;SEEN[id]=1;ls("fx-com-seen",Object.keys(SEEN).slice(-800).join(","))}
  function getNick(){return ls("fx-com-nick")||""}
  function setNick(n){if(n)ls("fx-com-nick",n)}

  function api(path,body){
    var init={method:body?"POST":"GET",credentials:"same-origin",headers:{}};
    if(body){init.headers["content-type"]="application/json";init.body=JSON.stringify(body)}
    return fetch("/api/community/"+path,init).then(function(r){
      return r.json().catch(function(){return {}}).then(function(j){if(!r.ok&&!j.error)j.error="문제가 생겼습니다 ("+r.status+"). 잠시 뒤 다시 해 주세요.";return j});
    }).catch(function(){return {error:"연결이 끊겼습니다. 잠시 뒤 다시 해 주세요."}});
  }
  var TT=0;
  function toast(msg){var t=$("toast");t.textContent=msg;t.hidden=false;clearTimeout(TT);TT=setTimeout(function(){t.hidden=true},2600)}
  function setMe(m){if(!m)return;ME=m;$("tabq").hidden=!ME.admin}

  /* 본문: 글자로만 넣고 http(s) 주소만 링크로 */
  function linkify(text){
    var f=document.createDocumentFragment(),re=/https?:\/\/[^\s<>"]+/gi,last=0,m;
    while((m=re.exec(text))){
      var url=m[0].replace(/[),.!?'"\]]+$/,""),ok=false;
      try{ok=/^https?:$/.test(new URL(url).protocol)}catch(e){}
      f.append(text.slice(last,m.index));
      f.append(ok?el("a",{href:url,target:"_blank",rel:"nofollow ugc noopener noreferrer"},url):url);
      last=m.index+url.length;re.lastIndex=last;
    }
    f.append(text.slice(last));
    return f;
  }
  function nickEl(x){
    if(x.admin)return el("span",{class:"nick adm"},x.nick);
    return el("span",{class:"nick"},x.nick,x.tag?el("span",{class:"tag",title:"같은 접속에서 쓴 글에는 같은 네 글자가 붙습니다"},x.tag):null);
  }
  function flagText(x){
    if(!ME.admin||!(x.hidden||x.reports))return null;
    return el("span",{class:"flag"}," · "+(x.hidden===2?"신고 누적 자동 가림":x.hidden?"가림":"")+(x.hidden&&x.reports?" · ":"")+(x.reports?"신고 "+x.reports:""));
  }
  function narrow(){return window.matchMedia&&matchMedia("(max-width: 860px)").matches}

  /* ---------- 페이지·주소: ?p=글 ?write ?edit=글 ?guide ?queue ---------- */
  var tabs=[].slice.call(document.querySelectorAll(".pager button"));
  tabs.forEach(function(b){b.addEventListener("click",function(){nav(b.dataset.go==="board"?BASE:BASE+"?"+b.dataset.go)})});
  function page(v){
    ["board","guide","queue"].forEach(function(k){$("v-"+k).hidden=(k!==v)});
    tabs.forEach(function(b){b.setAttribute("aria-selected",String(b.dataset.go===v))});
    document.querySelector('nav.toc ul[data-for="guide"]').hidden=(v!=="guide");
  }
  function nav(url,replace){
    var wasBoard=!$("v-board").hidden;
    history[replace?"replaceState":"pushState"](null,"",url);route();
    var u=new URLSearchParams(location.search);
    if(!(wasBoard&&!$("v-board").hidden&&!narrow())&&!location.hash)window.scrollTo(0,0);
    if(narrow()&&(u.get("p")||u.has("write")||u.get("edit")))$("inbox").scrollIntoView({block:"start"});
  }
  document.addEventListener("click",function(e){
    var a=e.target.closest&&e.target.closest("a[data-nav]");
    if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
    e.preventDefault();nav(a.getAttribute("href"));
    var h=a.getAttribute("href").split("#")[1];if(h){var t=$(h);if(t)t.scrollIntoView()}
  });
  window.addEventListener("popstate",route);
  function route(){
    var u=new URLSearchParams(location.search);
    if(u.has("guide")){page("guide");document.title="이용 안내 · "+TITLE;if(!S.loaded)loadList(true);return}
    if(u.has("queue")){page("queue");document.title="신고·가림 목록 · "+TITLE;showQueue();return}
    page("board");
    var p=+u.get("p")||0,e=+u.get("edit")||0;
    S.mode=p?"post":e?"edit":u.has("write")?"write":"";S.sel=p||e||0;
    if(!S.loaded)loadList(true);else renderList();
    renderReader();
  }

  /* ---------- 목록 ---------- */
  var LQ=0;
  function loadList(reset,quiet){
    var q=new URLSearchParams();if(S.cat)q.set("cat",S.cat);if(S.q)q.set("q",S.q);if(S.sort!=="new")q.set("sort",S.sort);if(!reset)q.set("off",S.items.length);
    var my=++LQ;
    if(reset&&!quiet&&!S.loaded)$("nlist").replaceChildren(el("div",{class:"nx-empty"},"불러오는 중…"));
    return api("posts?"+q).then(function(j){
      if(my!==LQ)return;
      if(j.error){if(reset&&!S.loaded)$("nlist").replaceChildren(el("div",{class:"nx-empty"},j.error));else if(!quiet)toast(j.error);return}
      setMe(j.me);S.loaded=true;
      if(reset){S.items=j.items;S.notices=j.notices||[];S.counts=j.counts||{};S.stats=j.stats||null;S.queue=j.queue||0}
      else{var have={};S.items.forEach(function(x){have[x.id]=1});j.items.forEach(function(x){if(!have[x.id])S.items.push(x)})}
      S.more=j.more;
      renderControls();renderList();renderStats();
    });
  }
  function renderControls(){
    var tot=0;CATS.forEach(function(c){tot+=S.counts[c]||0});
    $("ncats").replaceChildren.apply($("ncats"),[""].concat(CATS).map(function(c){
      return el("button",{type:"button",class:"nx-cat","aria-pressed":String(S.cat===c),"data-c":c},c||"전체",el("span",{class:"n"},c?(S.counts[c]||0):tot));
    }));
    $("nsort").value=S.sort;$("nunread").checked=S.unread;$("nq").value=S.q;
    $("bh").textContent=S.cat?S.cat+" 게시판":"게시판";
  }
  function rowEl(x,notice){
    return el("a",{class:"nx-item"+(!notice&&unread(x)?" unread":"")+(notice?" notice":"")+(x.hidden?" hid":""),id:"r"+x.id,href:BASE+"?p="+x.id,"data-nav":true,"data-id":x.id,"aria-current":String(S.sel===x.id)},
      el("span",{class:"nx-dot"}),
      el("div",{class:"meta"},nickEl(x),sep(),el("time",{datetime:new Date(x.created).toISOString(),title:full(x.created)},rel(x.created))),
      el("div",{class:"t"},x.title,x.nc?el("span",{class:"nc","aria-label":"댓글 "+x.nc+"개"},"["+x.nc+"]"):null),
      el("div",{class:"tg"},el("b",{},x.cat)," · 조회 "+x.views+(x.likes?" · 추천 "+x.likes:""),flagText(x)));
  }
  function renderList(){
    var L=$("nlist"),keep=L.scrollTop,rows=[],day="";
    var items=S.items.filter(function(x){return !S.unread||unread(x)});
    var notices=S.unread?[]:S.notices;
    notices.forEach(function(x){rows.push(rowEl(x,true))});
    items.forEach(function(x){
      if(S.sort==="new"){var d=dayLabel(x.created);if(d[0]!==day){day=d[0];rows.push(el("div",{class:"nx-day"},d[0],el("span",{},d[1])))}}
      rows.push(rowEl(x));
    });
    if(!items.length)rows.push(el("div",{class:"nx-empty"},S.q||S.cat||S.unread?"조건에 맞는 글이 없습니다.":"아직 글이 없습니다. 첫 글을 써 보세요."));
    if(S.more)rows.push(el("div",{class:"nx-more"},el("button",{type:"button",class:"nx-btn",onclick:function(){this.disabled=true;loadList(false)}},"더 보기")));
    L.replaceChildren.apply(L,rows);L.scrollTop=keep;
    var n=S.items.filter(unread).length,b=$("nbadge");b.hidden=!n;b.textContent=n>99?"99+":String(n);
    var qb=$("qbadge");qb.hidden=!(ME.admin&&S.queue);qb.textContent=String(S.queue);
    $("ncredit").textContent="글 "+S.items.length+(S.more?"+":"")+"개 · 굵은 제목은 안 읽은 글 · PC에서는 j/k 로 옮겨 가며 봅니다";
  }
  function renderStats(){
    var st=S.stats;if(!st)return;
    $("stat").textContent=st.posts?"글 "+st.posts.toLocaleString()+" · 댓글 "+st.comments.toLocaleString()+(st.last?" · 마지막 글 "+rel(st.last):""):"아직 글이 없습니다 · 첫 글을 남겨 보세요";
  }
  $("ncats").addEventListener("click",function(e){var b=e.target.closest&&e.target.closest("[data-c]");if(!b)return;S.cat=b.getAttribute("data-c");loadList(true)});
  $("nsort").addEventListener("change",function(){S.sort=this.value;loadList(true)});
  $("nunread").addEventListener("change",function(){S.unread=this.checked;renderList()});
  var QT=0;$("nq").addEventListener("input",function(){var v=this.value.trim();clearTimeout(QT);QT=setTimeout(function(){if(v!==S.q){S.q=v;loadList(true)}},300)});
  $("nmark").addEventListener("click",function(){WM=Date.now();SEEN={};ls("fx-com-wm",String(WM));ls("fx-com-seen","");renderList()});
  document.addEventListener("keydown",function(e){
    if($("v-board").hidden||narrow()||$("dlg").open||/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)||e.metaKey||e.ctrlKey||e.altKey)return;
    var rows=[].slice.call(document.querySelectorAll("#nlist .nx-item"));if(!rows.length)return;
    var cur=-1;rows.forEach(function(r,i){if(+r.dataset.id===S.sel)cur=i});
    var to=e.key==="j"||e.key==="ArrowDown"?Math.min(rows.length-1,cur+1):e.key==="k"||e.key==="ArrowUp"?Math.max(0,cur-1):-1;
    if(to<0)return;e.preventDefault();nav(BASE+"?p="+rows[to].dataset.id,S.mode==="post");
    rows[to].scrollIntoView({block:"nearest"});
  });
  setInterval(function(){if(!document.hidden&&!$("v-board").hidden&&S.items.length<=PAGE)loadList(true,true)},60000);

  /* ---------- 오른쪽 보기 창 ---------- */
  function back(){return el("a",{class:"rd-back",href:BASE,"data-nav":true},"← 목록으로")}
  function renderReader(){
    $("inbox").classList.toggle("open",!!S.mode);
    if(!S.mode){
      document.title=TITLE;
      $("nreader").replaceChildren(el("div",{class:"nx-reader-empty"},el("span",{},"왼쪽 목록에서 글을 고르면 여기에 나옵니다."),el("a",{class:"nx-btn primary",href:BASE+"?write","data-nav":true},"글쓰기")));
      return;
    }
    if(S.mode==="post")return showPost(S.sel);
    showWrite(S.mode==="edit"?S.sel:0);
  }
  var PQ=0;
  function showPost(id,focus){
    var r=$("nreader"),my=++PQ;
    if(!focus){r.replaceChildren(back(),el("p",{class:"none"},"불러오는 중…"));r.scrollTop=0}
    var first=!SEEN[id];
    return api("post/"+id+(first&&!focus?"?v=1":"")).then(function(j){
      if(my!==PQ)return;
      if(j.error){r.replaceChildren(back(),el("p",{class:"none"},j.error));document.title=TITLE;return}
      setMe(j.me);var p=j.post;markSeen(id);document.title=p.title+" · "+TITLE;
      S.items.forEach(function(x){if(x.id===p.id){x.views=p.views;x.likes=p.likes;x.nc=j.comments.filter(function(c){return !c.hidden}).length}});
      renderList();
      var row=$("r"+id),L=$("nlist");   /* 고른 글이 목록 밖에 있으면 목록만 그 자리로 내림 */
      if(row&&!focus&&!narrow()){var lr=L.getBoundingClientRect(),rr=row.getBoundingClientRect();if(rr.top<lr.top+30||rr.bottom>lr.bottom)L.scrollTop+=rr.top-lr.top-40}
      var likeN=el("span",{},p.likes);
      var likeB=el("button",{class:"nx-btn"+(j.liked?" on":""),type:"button","aria-pressed":String(!!j.liked),onclick:function(){
        api("post/"+p.id+"/like",{}).then(function(x){if(x.error)return toast(x.error);likeB.classList.add("on");likeB.setAttribute("aria-pressed","true");likeN.textContent=x.likes;if(x.already)toast("이미 추천한 글입니다.")});
      }},"추천 ",likeN);
      var own=[];
      if(!ME.admin||p.admin)own.push(el("a",{class:"nx-btn",href:BASE+"?edit="+p.id,"data-nav":true},"고치기"));
      own.push(el("button",{class:"nx-btn warn",type:"button",onclick:function(){delPost(p)}},"지우기"));
      if(ME.admin){
        own.push(p.hidden?el("button",{class:"nx-btn",type:"button",onclick:function(){adm("unhide","post",p.id)}},"보이기"):el("button",{class:"nx-btn",type:"button",onclick:function(){adm("hide","post",p.id)}},"가리기"));
        if(!p.admin)own.push(el("button",{class:"nx-btn warn",type:"button",onclick:function(){adm("ban","post",p.id)}},"IP 차단"));
      }
      r.replaceChildren(back(),
        el("span",{class:"pill"},p.cat),el("h3",{},p.title),
        el("div",{class:"byline"},nickEl(p),sep(),el("time",{datetime:new Date(p.created).toISOString()},full(p.created)),p.updated?el("span",{title:"고친 시각 "+full(p.updated)},"(고침)"):null,sep(),"조회 "+p.views,ME.admin&&p.ip?[sep(),el("span",{class:"ip"},p.ip)]:null,flagText(p)),
        el("div",{class:"rd-body"},linkify(p.body)),
        el("div",{class:"rd-act"},likeB,el("button",{class:"nx-btn",type:"button",onclick:function(){reportDlg("post",p.id)}},"신고"),el("span",{class:"grow"}),own),
        comments(p,j.comments));
      if(focus){var t=$(focus);if(t)t.scrollIntoView({block:"nearest"})}
    });
  }
  function comments(p,cs){
    var box=el("div",{class:"rd-cm",id:"cms"},el("h4",{},"댓글 ",el("span",{class:"muted"},cs.length)));
    cs.forEach(function(c){
      var tools=[el("button",{class:"lnk",type:"button",onclick:function(){reportDlg("comment",c.id)}},"신고"),el("button",{class:"lnk",type:"button",onclick:function(){delComment(c,p)}},"지우기")];
      if(ME.admin){
        tools.push(c.hidden?el("button",{class:"lnk",type:"button",onclick:function(){adm("unhide","comment",c.id)}},"보이기"):el("button",{class:"lnk",type:"button",onclick:function(){adm("hide","comment",c.id)}},"가리기"));
        if(!c.admin)tools.push(el("button",{class:"lnk",type:"button",onclick:function(){adm("ban","comment",c.id)}},"IP 차단"));
      }
      box.append(el("div",{class:"cm"+(c.hidden?" hid":""),id:"c"+c.id},
        el("div",{class:"meta"},nickEl(c),sep(),el("time",{title:full(c.created)},rel(c.created)),ME.admin&&c.ip?[sep(),el("span",{class:"ip"},c.ip)]:null,flagText(c),el("span",{class:"grow"}),tools),
        el("div",{class:"cm-body"},linkify(c.body))));
    });
    if(!cs.length)box.append(el("p",{class:"none",style:"padding:10px 0;border-top:1px solid var(--rule)"},"아직 댓글이 없습니다."));
    box.append(commentForm(p));
    return box;
  }
  function commentForm(p){
    var ta=el("textarea",{rows:3,maxlength:1000,placeholder:"댓글을 적어 주세요","aria-label":"댓글 내용"});
    var nk=el("input",{maxlength:12,placeholder:"닉네임",autocomplete:"nickname","aria-label":"닉네임",value:getNick()});
    var pw=el("input",{type:"password",maxlength:64,placeholder:"비밀번호 (4자 이상)",autocomplete:"new-password","aria-label":"비밀번호"});
    var hp=el("input",{class:"hp",tabindex:"-1",autocomplete:"off","aria-hidden":"true"});
    var err=el("span",{class:"err",role:"alert"}),btn=el("button",{class:"nx-btn primary",type:"submit"},"댓글 달기");
    var f=el("form",{class:"cf",novalidate:true},ME.admin?el("p",{class:"note"},"운영자로 씁니다."):el("div",{class:"who"},nk,pw),ta,hp,
      el("div",{class:"factions"},el("span",{class:"note"},"IP는 스팸 대응용으로만 저장되고 90일 뒤 지워집니다."),el("span",{class:"grow"}),err,btn));
    f.addEventListener("submit",function(e){
      e.preventDefault();btn.disabled=true;err.textContent="";
      api("post/"+p.id+"/comments",{body:ta.value,nick:nk.value,pw:pw.value,hp:hp.value}).then(function(r){
        btn.disabled=false;if(r.error){err.textContent=r.error;return}
        setNick(nk.value.trim());showPost(p.id,"c"+r.id);loadList(true,true);
      });
    });
    return f;
  }
  function field(label,input){return el("label",{class:"field"},label,input)}
  function showWrite(editId){
    var r=$("nreader");document.title=(editId?"글 고치기":"글쓰기")+" · "+TITLE;
    var cats=(ME.admin?["공지"]:[]).concat(CATS);
    var cat=el("select",{},el("option",{value:""},"말머리 고르기"),cats.map(function(c){return el("option",{value:c},c)}));cat.value=S.cat||"";
    var title=el("input",{maxlength:80,autocomplete:"off"}),body=el("textarea",{rows:12,maxlength:5000}),cnt=el("span",{class:"count"},"0 / 5,000");
    var nick=el("input",{maxlength:12,autocomplete:"nickname",value:getNick()}),pw=el("input",{type:"password",maxlength:64,autocomplete:editId?"current-password":"new-password"});
    var hp=el("input",{class:"hp",tabindex:"-1",autocomplete:"off","aria-hidden":"true"});
    var err=el("span",{class:"err",role:"alert"}),btn=el("button",{class:"nx-btn primary",type:"submit"},editId?"고치기":"올리기");
    var who=el("div",{class:"who"},editId?null:field("닉네임",nick),field(editId?"비밀번호 (글 쓸 때 정한 것)":"비밀번호 (4자 이상, 고치거나 지울 때 씀)",pw));
    if(ME.admin)who.hidden=true;
    function count(){cnt.textContent=body.value.length.toLocaleString()+" / 5,000"}
    body.addEventListener("input",count);
    var f=el("form",{class:"wf",novalidate:true},back(),el("h3",{},editId?"글 고치기":"글쓰기"),field("말머리",cat),field("제목",title),field("내용",body),cnt,who,hp,
      el("p",{class:"note"},ME.admin?"운영자로 씁니다. 공지는 목록 맨 위에 고정됩니다.":"글을 올리면 스팸·불법 게시물 대응을 위해 접속 IP와 브라우저 정보가 함께 저장되고 90일 뒤 지워집니다. 연락처·리딩방 홍보, 투자 권유, 욕설·비방은 지워집니다."),
      el("div",{class:"factions"},err,el("span",{class:"grow"}),el("a",{class:"nx-btn",href:editId?BASE+"?p="+editId:BASE,"data-nav":true},"취소"),btn));
    f.addEventListener("submit",function(e){
      e.preventDefault();btn.disabled=true;err.textContent="";
      api(editId?"post/"+editId+"/edit":"posts",{cat:cat.value,title:title.value,body:body.value,nick:nick.value,pw:pw.value,hp:hp.value}).then(function(x){
        btn.disabled=false;
        if(x.error){err.textContent=x.error;return}
        if(!editId)setNick(nick.value.trim());
        loadList(true,true);
        nav(x.id?BASE+"?p="+x.id:BASE,true);
      });
    });
    r.replaceChildren(f);r.scrollTop=0;
    if(editId)api("post/"+editId).then(function(j){
      if(j.error){err.textContent=j.error;btn.disabled=true;return}
      var p=j.post;cat.value=p.cat;title.value=p.title;body.value=p.body;count();
      who.hidden=!!(ME.admin&&p.admin);
    });
  }

  /* ---------- 지우기·신고·관리자 ---------- */
  function ask(title,fields,okText,run){
    var d=$("dlg"),err=el("p",{class:"err",role:"alert"}),ok=el("button",{class:"nx-btn primary",type:"submit"},okText);
    var f=el("form",{novalidate:true},el("h3",{},title),fields,err,el("div",{class:"dact"},el("button",{class:"nx-btn",type:"button",onclick:function(){d.close()}},"취소"),ok));
    f.addEventListener("submit",function(e){e.preventDefault();ok.disabled=true;err.textContent="";
      Promise.resolve(run()).then(function(msg){ok.disabled=false;if(msg)err.textContent=msg;else d.close()})});
    d.replaceChildren(f);d.showModal();var i=f.querySelector("input,textarea");if(i)i.focus();
  }
  function pwField(){return el("input",{type:"password",maxlength:64,placeholder:"글 쓸 때 정한 비밀번호",autocomplete:"current-password","aria-label":"비밀번호"})}
  function afterDelete(){toast("지웠습니다.");loadList(true,true);nav(BASE,true)}
  function delPost(p){
    if(ME.admin){if(!confirm("이 글과 댓글을 모두 지울까요? 되돌릴 수 없습니다."))return;
      return api("post/"+p.id+"/delete",{}).then(function(r){if(r.error)return toast(r.error);afterDelete()})}
    var pw=pwField();
    ask("글 지우기",[el("p",{class:"note"},"글과 달린 댓글이 모두 지워지고 되돌릴 수 없습니다."),pw],"지우기",function(){
      return api("post/"+p.id+"/delete",{pw:pw.value}).then(function(r){if(r.error)return r.error;afterDelete()});
    });
  }
  function delComment(c,p){
    function done(){toast("지웠습니다.");showPost(p.id,"cms");loadList(true,true)}
    if(ME.admin){if(!confirm("이 댓글을 지울까요?"))return;
      return api("comment/"+c.id+"/delete",{}).then(function(r){if(r.error)return toast(r.error);done()})}
    var pw=pwField();
    ask("댓글 지우기",[pw],"지우기",function(){return api("comment/"+c.id+"/delete",{pw:pw.value}).then(function(r){if(r.error)return r.error;done()})});
  }
  var REASONS=["욕설·비방","광고·도배","투자 권유·리딩방","개인정보 노출","권리 침해(명예훼손·저작권)","본인 글 삭제 요청","기타"];
  function reportDlg(kind,id){
    var box=el("div",{class:"reasons"},REASONS.map(function(r,i){return el("label",{},el("input",{type:"radio",name:"why",value:r,checked:i===0}),r)}));
    var more=el("textarea",{rows:2,maxlength:150,placeholder:"자세한 내용 (선택)","aria-label":"자세한 내용"});
    ask(kind==="post"?"글 신고":"댓글 신고",[box,more],"신고하기",function(){
      var w=box.querySelector("input:checked"),why=(w?w.value:"기타")+(more.value.trim()?": "+more.value.trim():"");
      return api("report",{kind:kind,id:id,reason:why}).then(function(r){if(r.error)return r.error;toast(r.already?"이미 신고했습니다.":"신고했습니다. 운영자가 확인합니다.")});
    });
  }
  function adm(action,kind,id,extra){
    if(action==="ban"&&!confirm("이 글을 쓴 IP의 글쓰기를 막고 이 글을 가릴까요?"))return;
    var b={action:action,kind:kind,id:id};for(var k in extra||{})b[k]=extra[k];
    return api("admin",b).then(function(r){if(r.error)return toast(r.error);toast("처리했습니다.");loadList(true,true);route()});
  }
  function showQueue(){
    var box=$("queue");box.replaceChildren(el("p",{class:"muted small"},"불러오는 중…"));
    api("admin/queue").then(function(j){
      if(j.error){box.replaceChildren(el("p",{class:"muted"},j.error));return}
      function state(x){return x.hidden===2?"자동 가림":x.hidden?"가림":"보임"}
      function acts(kind,x){return el("td",{class:"nw"},
        x.hidden?el("button",{class:"lnk",type:"button",onclick:function(){adm("unhide",kind,x.id)}},"보이기(신고 지움)"):el("button",{class:"lnk",type:"button",onclick:function(){adm("hide",kind,x.id)}},"가리기"),
        el("button",{class:"lnk",type:"button",onclick:function(){adm("ban",kind,x.id)}},"IP 차단"))}
      function table(head,rows){return el("div",{class:"tbl"},el("table",{},el("thead",{},el("tr",{},head.map(function(h){return el("th",{},h)}))),el("tbody",{},rows.length?rows:el("tr",{},el("td",{colspan:head.length,class:"muted"},"없음")))))}
      var why={};(j.reasons||[]).forEach(function(r){var k=r.kind+r.ref;(why[k]=why[k]||[]).push(r.reason)});
      box.replaceChildren(
        el("h3",{},"글"),table(["글","쓴 사람","상태","신고·사유","IP","처리"],j.posts.map(function(x){return el("tr",{},
          el("td",{},el("a",{href:BASE+"?p="+x.id,"data-nav":true},x.title)),el("td",{class:"nw"},nickEl(x),el("div",{class:"small muted"},full(x.created))),el("td",{class:"nw"},state(x)),
          el("td",{},x.reports+"건",el("div",{class:"small muted"},(why["post"+x.id]||[]).join(" / "))),el("td",{class:"ip"},x.ip||"–"),acts("post",x))})),
        el("h3",{style:"margin-top:12px"},"댓글"),table(["댓글","쓴 사람","상태","신고·사유","IP","처리"],j.comments.map(function(x){return el("tr",{},
          el("td",{},el("a",{href:BASE+"?p="+x.post,"data-nav":true},x.body.slice(0,80)),el("div",{class:"small muted"},"글: "+(x.title||"(지워진 글)"))),el("td",{class:"nw"},nickEl(x),el("div",{class:"small muted"},full(x.created))),el("td",{class:"nw"},state(x)),
          el("td",{},x.reports+"건",el("div",{class:"small muted"},(why["comment"+x.id]||[]).join(" / "))),el("td",{class:"ip"},x.ip||"–"),acts("comment",x))})),
        el("h3",{style:"margin-top:12px"},"글쓰기를 막은 IP"),table(["IP","사유","막은 시각",""],j.bans.map(function(x){return el("tr",{},
          el("td",{class:"ip"},x.ip),el("td",{},x.reason||"–"),el("td",{class:"nw"},full(x.created)),el("td",{class:"nw"},el("button",{class:"lnk",type:"button",onclick:function(){if(confirm(x.ip+" 차단을 풀까요?"))adm("unban","",0,{ip:x.ip})}},"차단 풀기")))})));
    });
  }

  /*<visit>*/
  /* 방문 기록(사이트 주인만 /admin 에서 조회) — 환율 조회와 같은 신호, 화면 구분만 community */
  try{
    var vid=ls("fx-vid");if(!vid){vid=Math.random().toString(36).slice(2,10)+Date.now().toString(36);ls("fx-vid",vid)}
    var hb=JSON.stringify({v:vid,r:document.referrer||"",o:ls("fx-owner")==="1"?1:0,w:screen.width||0,p:"community"});
    if(!(navigator.sendBeacon&&navigator.sendBeacon("/api/hit",hb)))fetch("/api/hit",{method:"POST",mode:"no-cors",body:hb,keepalive:true}).catch(function(){});
  }catch(e){}
  /*</visit>*/

  api("me").then(function(j){setMe(j.error?null:j)}).then(function(){route();if(location.hash){var t=$(location.hash.slice(1));if(t)t.scrollIntoView()}});
})();
