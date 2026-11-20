// 환율 조회 앱(/app/) — 시세·차트·환전 계산기·환율 알림·더보기. 자료는 본 사이트와 같은 API(/api/intraday·fx·brief·news, /usdkrw_smbs.json).
// 알림: 브라우저 Web Push 구독 → /api/push/save 에 조건 저장 → backup-worker 가 매분 확인해 발송(lib/alerts.js).
(function () {
  "use strict";
  var VAPID = "BDSFQWRi6hGTaDZT3vyJD4oXwykzUDJCoM0HRgXRW3NXFIDYuIhma2pPLP0ECmU8T7IhKcWcrR5fQHoiBE1w9jw";
  var C = {
    usd: { name: "달러/원", sub: "", fx: "달러", sym: "$", per: 1, s: "usdkrw", spr: 1.75, sw: 5 },
    jpy: { name: "엔/원", sub: "100엔당", fx: "엔", sym: "¥", per: 100, s: "jpykrw", spr: 1.75, sw: 5 },
    eur: { name: "유로/원", sub: "", fx: "유로", sym: "€", per: 1, s: "eurkrw", spr: 1.99, sw: 7 },
  };
  var CURS = ["usd", "jpy", "eur"];
  var D = {}, LT = {}, lastOk = 0;
  var $ = function (id) { return document.getElementById(id); };
  var NS = "http://www.w3.org/2000/svg";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function f1(v) { return v == null || !isFinite(v) ? "–" : v.toLocaleString("ko-KR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
  function f2(v) { return v.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function f0(v) { return Math.round(v).toLocaleString("ko-KR"); }
  function sgn(d, f) { f = f || f1; return (d > 0 ? "+" : d < 0 ? "−" : "±") + f(Math.abs(d)); }
  function cls(d) { return d > 0.0001 ? "up" : d < -0.0001 ? "dn" : "flat"; }
  function num(s) { var v = parseFloat(String(s).replace(/[,\s원%$¥€]/g, "")); return isFinite(v) ? v : NaN; }
  function kst(m) { var d = new Date((m + 540) * 60000); return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), mi: d.getUTCMinutes(), wd: d.getUTCDay() }; }
  function p2(n) { return (n < 10 ? "0" : "") + n; }
  function hm(m) { var k = kst(m); return p2(k.h) + ":" + p2(k.mi); }
  function md(m) { var k = kst(m); return k.mo + "/" + k.d; }
  function dayStart(m) { return Math.floor((m + 540 - 360) / 1440) * 1440 + 360 - 540; }   // 그 시각이 속한 하루(06:00 시작)
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function toast(t) { var el = $("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2600); }
  function getJ(u) { return fetch(u, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  function postJ(u, b) {
    return fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ("오류 " + r.status)); return j; }); });
  }

  /* ---------- 탭 ---------- */
  var tab = "home";
  function route() {
    var h = location.hash.replace(/^#/, ""), m = /^c=(usd|jpy|eur)$/.exec(h);
    if (m) { chCur = m[1]; h = "chart"; }
    if (!/^(home|chart|calc|alerts|more)$/.test(h)) h = "home";
    tab = h;
    document.querySelectorAll("main>section").forEach(function (s) { s.hidden = s.getAttribute("data-tab") !== h; });
    document.querySelectorAll(".tabbar a").forEach(function (a) { if (a.getAttribute("data-t") === h) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (h === "chart") { pressSeg("chCur", "c", chCur); drawChart(); }
    if (h === "calc") calc();
    if (h === "alerts") alRender();
    if (h === "more") loadNews();
    window.scrollTo(0, 0);
  }
  function pressSeg(id, attr, v) { $(id).querySelectorAll("button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-" + attr) === v)); }); }
  function onSeg(id, attr, fn) { $(id).addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var v = b.getAttribute("data-" + attr); pressSeg(id, attr, v); fn(v); }); }

  /* ---------- 시세 ---------- */
  function info(c) {   // 지금 값, 06:00 대비, 오늘 06:00 이후 점들
    var x = D[c]; if (!x || !x.m1 || !x.m1.t.length) return null;
    var t = x.m1.t, v = x.m1.c, n = t.length, last = t[n - 1], ds = dayStart(last), i0 = n - 1;
    while (i0 > 0 && t[i0 - 1] >= ds) i0--;
    return { now: v[n - 1], at: last, ds: ds, base: v[i0], i0: i0, t: t, v: v };
  }
  function sparkSvg(I) {   // 06:00부터 지금까지를 카드 폭 전체에(본 사이트 ③ 하루와 같은 방식)
    var W = 320, H = 56, lo = Infinity, hi = -Infinity, i;
    for (i = I.i0; i < I.t.length; i++) { lo = Math.min(lo, I.v[i]); hi = Math.max(hi, I.v[i]); }
    if (hi - lo < 0.5) { var mid = (hi + lo) / 2; hi = mid + 0.25; lo = mid - 0.25; }
    var span = Math.max(60, I.at - I.ds), X = function (m) { return (m - I.ds) / span * W; }, Y = function (y) { return 3 + (hi - y) / (hi - lo) * (H - 6); };
    var d = "";
    for (i = I.i0; i < I.t.length; i++) d += (i === I.i0 ? "M" : "L") + X(I.t[i]).toFixed(1) + " " + Y(I.v[i]).toFixed(1);
    return '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true"><line class="base" x1="0" x2="' + W + '" y1="' + Y(I.base).toFixed(1) + '" y2="' + Y(I.base).toFixed(1) + '" vector-effect="non-scaling-stroke"/><path class="spark ' + cls(I.now - I.base) + '" d="' + d + '" vector-effect="non-scaling-stroke"/></svg>';
  }
  function renderCards() {
    var h = "";
    CURS.forEach(function (c) {
      var I = info(c), M = C[c];
      if (!I) { h += '<button type="button" class="card cur skel" data-c="' + c + '"><span class="lab">' + M.name + (M.sub ? " <small>" + M.sub + "</small>" : "") + '</span><span class="v">' + (LT[c] === "err" ? "불러오지 못함" : "…") + "</span></button>"; return; }
      var d = I.now - I.base, pct = d / I.base * 100;
      h += '<button type="button" class="card cur" data-c="' + c + '" aria-label="' + M.name + " " + f1(I.now) + "원, 06:00 대비 " + sgn(d) + '원. 차트 보기">' +
        '<span class="lab"><span>' + M.name + (M.sub ? " <small>" + M.sub + "</small>" : "") + "</span><small>" + hm(I.at) + "</small></span>" +
        '<span class="v">' + f1(I.now) + '<span class="u">원</span></span>' +
        '<span class="chg ' + cls(d) + '">' + sgn(d) + " (" + sgn(pct, f2) + "%)</span>" + sparkSvg(I) + "</button>";
    });
    $("cards").innerHTML = h;
  }
  $("cards").addEventListener("click", function (e) { var b = e.target.closest(".cur"); if (b) location.hash = "#c=" + b.getAttribute("data-c"); });

  function loadCur(c) {
    return getJ("/api/intraday" + (c === "usd" ? "" : "?c=" + c)).then(function (j) { D[c] = j; LT[c] = Date.now(); lastOk = Date.now(); })
      .catch(function () { if (!D[c]) LT[c] = "err"; });
  }
  function loadBrief() {
    return getJ("/api/brief?k=fx").then(function (b) {
      if (!b || !b.title) return;
      $("briefT").textContent = b.title; $("briefTime").textContent = b.asof ? b.asof + " 기준" : "";
      $("briefL").innerHTML = (b.lines || []).slice(0, 3).map(function (x) { return "<li>" + esc(x.text) + "</li>"; }).join("");
      $("brief").hidden = false;
    }).catch(function () {});
  }
  var smbsDone = 0;
  function loadSmbs() {
    if (Date.now() - smbsDone < 30 * 60000) return;
    getJ("/usdkrw_smbs.json").then(function (j) {
      var n = j.v.length; if (n < 2) return; smbsDone = Date.now();
      var d = j.v[n - 1] - j.v[n - 2];
      $("smbsV").textContent = f1(j.v[n - 1]); $("smbsD").textContent = j.d[n - 1].slice(5).replace("-", "/") + " 고시";
      $("smbsC").className = "chg " + cls(d); $("smbsC").textContent = "전일 대비 " + sgn(d);
      $("smbs").hidden = false;
    }).catch(function () {});
  }
  function status() {
    var el = $("stat");
    if (!navigator.onLine) { el.className = "stat off"; el.textContent = "오프라인" + (lastOk ? " · " + hm(Math.floor(lastOk / 60000)) + " 자료" : ""); return; }
    el.className = "stat";
    if (!lastOk) { el.textContent = "불러오는 중…"; return; }
    var a = Math.floor((Date.now() - lastOk) / 60000);
    el.textContent = a < 1 ? "방금 갱신" : a + "분 전 갱신";
  }
  var busy = false;
  function refresh() {
    if (busy) return; busy = true; status();
    Promise.all(CURS.map(loadCur).concat([loadBrief()])).then(function () {
      busy = false; renderCards(); status(); loadSmbs();
      if (tab === "chart" && /^(day|3d|1m)$/.test(chRng)) drawChart();
      if (tab === "calc" && !calcCustom) calc();
      if (tab === "alerts") tHint();
    });
  }
  $("stat").addEventListener("click", refresh);
  setInterval(function () { if (document.visibilityState === "visible") refresh(); }, 60000);
  setInterval(status, 15000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && Date.now() - lastOk > 50000) refresh(); });
  window.addEventListener("online", refresh); window.addEventListener("offline", status);

  /* ---------- 차트 ---------- */
  var chCur = "usd", chRng = "day", LONG = {};
  onSeg("chCur", "c", function (v) { chCur = v; drawChart(); });
  onSeg("chRng", "r", function (v) { chRng = v; drawChart(); });

  function series(cb) {   // {t:[epoch 분], v:[], w:[faint?], base}
    var x = D[chCur];
    if (chRng === "day" || chRng === "3d") {
      if (!x) return cb(null);
      var I = info(chCur), W = {}, s0 = chRng === "day" ? I.i0 : 0;
      (x.m1.w || []).forEach(function (r) { for (var i = r[0]; i <= r[1]; i++) W[i] = 1; });
      var o = { t: [], v: [], w: [], base: chRng === "day" ? I.base : null };
      for (var i = s0; i < x.m1.t.length; i++) { o.t.push(x.m1.t[i]); o.v.push(x.m1.c[i]); o.w.push(!!W[i]); }
      return cb(o);
    }
    if (chRng === "1m") {
      if (!x) return cb(null);
      var B = x.m10, WK = {}, lim = B.t[B.t.length - 1] - 31 * 1440;
      (B.w || []).forEach(function (k) { WK[k] = 1; });
      var q = { t: [], v: [], w: [] };
      B.t.forEach(function (k, i) { if (k >= lim) { q.t.push(k); q.v.push(B.c[i]); q.w.push(!!WK[k]); } });
      return cb(q);
    }
    var key = chCur + chRng;
    if (LONG[key] && Date.now() - LONG[key].at < 30 * 60000) return cb(LONG[key].d);
    getJ("/api/fx?s=" + C[chCur].s + "&r=" + chRng).then(function (j) {
      var o = { t: [], v: [], w: [] };
      j.t.forEach(function (t, i) { if (j.c[i] != null) { o.t.push(Math.floor(t / 60)); o.v.push(j.c[i]); o.w.push(false); } });
      LONG[key] = { at: Date.now(), d: o }; cb(o);
    }).catch(function () { cb(null); });
  }
  function nice(lo, hi, n) {
    var span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span / n))), e = span / n / step;
    step *= e >= 5 ? 10 : e >= 2 ? 5 : e >= 1 ? 2 : 1;
    var out = []; for (var v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
    return out;
  }
  function tickKey(m) {
    var k = kst(m), kd = kst(m - 360);
    if (chRng === "day") return Math.floor(((k.h + 18) % 24) / 3);   // 06시 기준 3시간
    if (chRng === "3d") return kd.mo * 100 + kd.d;
    if (chRng === "1m") return Math.floor((m + 540 - 360 + 4 * 1440) / (7 * 1440));   // 주(월요일)
    if (chRng === "1y") return k.y * 12 + k.mo;
    return k.y;
  }
  function tickLab(m) {
    var k = kst(m);
    if (chRng === "day") return p2(k.h) + ":00";
    if (chRng === "3d" || chRng === "1m") { var kd = kst(m - 360); return kd.mo + "/" + kd.d; }
    if (chRng === "1y") return k.mo === 1 ? k.y + "" : k.mo + "월";
    return "'" + String(k.y).slice(2);
  }
  var CH = null;
  function drawChart() {
    var box = $("chart"), want = chCur + chRng;
    $("chNote").textContent = chRng === "day" ? "오늘 06:00(국제시장 하루 시작)부터 1분 시세. 옅은 점선은 시세가 끊겨 Wise 시장 환율로 메운 구간입니다. 손가락으로 짚으면 그 시각의 값이 나옵니다."
      : chRng === "3d" ? "최근 3일 1분 시세(거래 없는 주말은 건너뜀). 옅은 점선은 Wise 시장 환율로 메운 구간입니다."
      : chRng === "1m" ? "최근 1개월 10분 종가(거래 없는 주말은 건너뜀)."
      : chRng === "1y" ? "최근 1년 일별 종가(국제 시세)." : "최근 10년 주별 종가(국제 시세).";
    if (!CH || CH.key !== want) box.innerHTML = '<div class="msg">불러오는 중…</div>';
    series(function (S) {
      if (chCur + chRng !== want) return;
      if (!S || S.v.length < 2) { box.innerHTML = '<div class="msg">' + (navigator.onLine ? "자료를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." : "오프라인입니다. 연결되면 다시 불러옵니다.") + "</div>"; CH = null; return; }
      render(box, S, want);
    });
  }
  function render(box, S, key) {
    var Wd = box.clientWidth || 340, Hd = box.clientHeight || 260, L = 6, R = 48, T = 10, Bm = 22;
    var n = S.v.length, lo = Math.min.apply(null, S.v), hi = Math.max.apply(null, S.v);
    if (S.base != null) { lo = Math.min(lo, S.base); hi = Math.max(hi, S.base); }
    var pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    var X = function (i) { return L + i / (n - 1) * (Wd - L - R); }, Y = function (v) { return T + (hi - v) / (hi - lo) * (Hd - T - Bm); };
    var g = '<g class="grid">';
    nice(lo, hi, 4).forEach(function (v) { var y = Y(v).toFixed(1); g += '<line x1="' + L + '" x2="' + (Wd - R + 4) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (Wd - R + 8) + '" y="' + (+y + 4) + '">' + (hi - lo > 50 ? f0(v) : f1(v)) + "</text>"; });
    g += '</g><g class="xt">';
    var lastX = -99, prev = null;
    if (S.base != null) { g += '<text x="' + L + '" y="' + (Hd - 6) + '">06:00</text>'; lastX = L + 20; }
    for (var i = 0; i < n; i++) {
      var k = tickKey(S.t[i]);
      if (prev !== null && k !== prev && X(i) - lastX >= 58 && X(i) < Wd - R - 20) { g += '<line x1="' + X(i).toFixed(1) + '" x2="' + X(i).toFixed(1) + '" y1="' + (Hd - Bm) + '" y2="' + (Hd - Bm + 4) + '" stroke="var(--rule-strong)"/><text x="' + X(i).toFixed(1) + '" y="' + (Hd - 6) + '" text-anchor="middle">' + tickLab(S.t[i]) + "</text>"; lastX = X(i); }
      prev = k;
    }
    g += "</g>";
    if (S.base != null) g += '<line x1="' + L + '" x2="' + (Wd - R) + '" y1="' + Y(S.base).toFixed(1) + '" y2="' + Y(S.base).toFixed(1) + '" stroke="var(--rule-strong)" stroke-dasharray="3 3"/>';
    // 선: 메운 구간(w)은 점선, 그 앞뒤 점까지 이어 끊김 없이
    var dMain = "", dW = "", area = "";
    for (i = 0; i < n; i++) {
      var p = X(i).toFixed(1) + " " + Y(S.v[i]).toFixed(1);
      area += (i ? "L" : "M") + p;
      if (!S.w[i]) dMain += (i && !S.w[i - 1] ? "L" : "M") + p;
      if (S.w[i] || (i && S.w[i - 1]) || (i < n - 1 && S.w[i + 1])) dW += (i && (S.w[i] || S.w[i - 1]) ? "L" : "M") + p;
    }
    area += "L" + X(n - 1).toFixed(1) + " " + (Hd - Bm) + "L" + L + " " + (Hd - Bm) + "Z";
    box.innerHTML = '<svg viewBox="0 0 ' + Wd + " " + Hd + '" role="img" aria-label="' + C[chCur].name + ' 그래프">' + g +
      '<path class="area" d="' + area + '"/><path class="ln" d="' + dMain + '"/>' + (dW ? '<path class="ln w" d="' + dW + '"/>' : "") +
      '<g class="cross" hidden><line y1="' + T + '" y2="' + (Hd - Bm) + '"/><circle r="4.5"/></g></svg>';
    CH = { key: key, S: S, X: X, Y: Y, n: n, L: L, R: R, W: Wd };
    var first = S.base != null ? S.base : S.v[0];
    var sh = Math.max.apply(null, S.v), sl = Math.min.apply(null, S.v), last = S.v[n - 1];
    $("chSum").innerHTML = "<div>" + (S.base != null ? "06:00" : "시작") + "<b>" + f1(first) + "</b></div><div>고가<b>" + f1(sh) + "</b></div><div>저가<b>" + f1(sl) + "</b></div><div>변동<b class='" + cls(last - first) + "'>" + sgn(last - first) + "</b></div>";
    readout(n - 1);
  }
  function tlabel(m) { return chRng === "day" ? hm(m) : chRng === "3d" || chRng === "1m" ? md(m) + " " + hm(m) : (function (k) { return k.y + "." + p2(k.mo) + "." + p2(k.d); })(kst(m)); }
  function readout(i, show) {
    if (!CH) return;
    var S = CH.S, v = S.v[i], first = S.base != null ? S.base : S.v[0], d = v - first;
    $("roV").textContent = f1(v);
    $("roC").className = "rc " + cls(d); $("roC").textContent = sgn(d) + " (" + sgn(d / first * 100, f2) + "%)";
    $("roT").textContent = tlabel(S.t[i]) + (S.w[i] ? " · Wise로 메움" : "") + (show ? "" : i === CH.n - 1 ? " · 최신" : "");
    var cr = $("chart").querySelector(".cross");
    if (!cr) return;
    cr.hidden = !show;
    if (show) { var x = CH.X(i), y = CH.Y(v); cr.querySelector("line").setAttribute("x1", x); cr.querySelector("line").setAttribute("x2", x); cr.querySelector("circle").setAttribute("cx", x); cr.querySelector("circle").setAttribute("cy", y); }
  }
  (function () {
    var box = $("chart");
    function at(e) {
      if (!CH) return;
      var r = box.getBoundingClientRect(), x = (e.clientX - r.left) * (CH.W / r.width);
      var i = Math.round((x - CH.L) / (CH.W - CH.L - CH.R) * (CH.n - 1));
      readout(Math.max(0, Math.min(CH.n - 1, i)), true);
    }
    box.addEventListener("pointerdown", at); box.addEventListener("pointermove", function (e) { if (e.pointerType === "mouse" || e.buttons || e.pressure) at(e); });
    ["pointerleave", "pointercancel"].forEach(function (ev) { box.addEventListener(ev, function () { if (CH) readout(CH.n - 1, false); }); });
    box.addEventListener("pointerup", function (e) { if (e.pointerType !== "mouse" && CH) setTimeout(function () { readout(CH.n - 1, false); }, 1500); });
  })();
  var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { if (tab === "chart" && CH) render($("chart"), CH.S, CH.key); }, 150); });

  /* ---------- 계산기 ---------- */
  var CS = store("fx-app-calc") || { c: "usd", d: "buy", i: "fx", amt: "1,000", spr: {}, pref: "0" }, calcCustom = false;
  function calcInit() {
    pressSeg("cCur", "c", CS.c); pressSeg("cDir", "d", CS.d); pressSeg("cIn", "i", CS.i);
    $("cAmt").value = CS.amt; $("cPref").value = CS.pref; $("cSpr").value = CS.spr[CS.c] || C[CS.c].spr;
    labels();
  }
  function labels() {
    var M = C[CS.c];
    $("cAmtU").textContent = CS.i === "fx" ? M.fx : "원";
    $("cAmtL").textContent = CS.i === "fx" ? (CS.d === "buy" ? "살 외화 금액" : "팔 외화 금액") : (CS.d === "buy" ? "쓸 원화 금액" : "받고 싶은 원화 금액");
    $("cBaseU").textContent = CS.c === "jpy" ? "원/100엔" : "원";
  }
  onSeg("cCur", "c", function (v) { CS.c = v; calcCustom = false; $("cSpr").value = CS.spr[v] || C[v].spr; labels(); calc(); });
  onSeg("cDir", "d", function (v) { CS.d = v; labels(); calc(); });
  onSeg("cIn", "i", function (v) { CS.i = v; labels(); calc(); });
  $("cBase").addEventListener("input", function () { calcCustom = true; $("cBaseNote").textContent = "(직접 넣은 값 · 통화를 다시 누르면 지금 시세)"; calc(true); });
  ["cAmt", "cSpr", "cPref"].forEach(function (id) { $(id).addEventListener("input", function () { calc(true); }); });
  $("cAmt").addEventListener("blur", function () { var v = num(this.value); if (isFinite(v)) this.value = v.toLocaleString("ko-KR", { maximumFractionDigits: 2 }); });
  $("cPrefChips").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; $("cPref").value = b.getAttribute("data-p"); calc(true); });
  function calc(fromInput) {
    var M = C[CS.c], I = info(CS.c);
    if (!calcCustom) { $("cBaseNote").textContent = I ? "(지금 시세 " + hm(I.at) + ", 바꿀 수 있음)" : "(시세를 불러오는 중)"; if (I && !fromInput) $("cBase").value = f2(I.now); else if (I && document.activeElement !== $("cBase")) $("cBase").value = f2(I.now); }
    var mid = num($("cBase").value), spr = num($("cSpr").value), pref = Math.max(0, Math.min(100, num($("cPref").value) || 0)), amt = num($("cAmt").value);
    CS.amt = $("cAmt").value; CS.pref = String(pref); if (isFinite(spr)) CS.spr[CS.c] = spr; store("fx-app-calc", CS);
    document.querySelectorAll("#cPrefChips button").forEach(function (b) { b.classList.toggle("on", +b.getAttribute("data-p") === pref); });
    var out = $("cRes");
    if (!(mid > 0) || !(spr >= 0) || !(amt > 0)) { out.innerHTML = '<span class="muted">금액과 환율을 넣으면 계산합니다.</span>'; return; }
    var s = spr * (1 - pref / 100) / 100, rate = mid * (CS.d === "buy" ? 1 + s : 1 - s), per = M.per;
    var fxAmt, krw;
    if (CS.i === "fx") { fxAmt = amt; krw = amt * rate / per; } else { krw = amt; fxAmt = amt * per / rate; }
    var fee = Math.abs(rate - mid) * fxAmt / per, saved = mid * spr / 100 * pref / 100 * fxAmt / per;
    var fxTxt = M.sym + fxAmt.toLocaleString("ko-KR", { maximumFractionDigits: CS.c === "jpy" ? 0 : 2 });
    var head = CS.i === "fx" ? (CS.d === "buy" ? "필요한 원화" : "받는 원화") : (CS.d === "buy" ? "살 수 있는 " + M.fx : "팔아야 할 " + M.fx);
    var big = CS.i === "fx" ? f0(krw) + "<small>원</small>" : fxTxt;
    out.innerHTML = '<div class="muted small">' + head + '</div><div class="big">' + big + "</div><dl>" +
      "<dt>적용 환율</dt><dd>" + f2(rate) + (per === 100 ? " 원/100엔" : " 원") + "</dd>" +
      "<dt>" + (CS.i === "fx" ? "환전 금액" : "원화 금액") + "</dt><dd>" + (CS.i === "fx" ? fxTxt : f0(krw) + "원") + "</dd>" +
      "<dt>수수료(어림)</dt><dd>" + f0(fee) + "원</dd>" + (pref ? "<dt>우대로 아낀 돈</dt><dd>" + f0(saved) + "원</dd>" : "") + "</dl>";
  }

  /* ---------- 알림 ---------- */
  var AL = { sub: null, rules: store("fx-app-rules") || { t: [], s: [], m: { on: false } }, st: {}, ready: false };
  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  var canPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  function u8(b64) { var s = (b64 + "===".slice((b64.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/"), r = atob(s), a = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) a[i] = r.charCodeAt(i); return a; }
  function swReg() { return navigator.serviceWorker.ready; }
  function alInit() {
    if (!canPush) { AL.ready = true; return; }
    swReg().then(function (reg) { return reg.pushManager.getSubscription(); }).then(function (s) {
      AL.sub = s; AL.ready = true;
      if (s) return postJ("/api/push/get", { endpoint: s.endpoint }).then(function (j) {
        if (j.none) return alSave();
        AL.rules = fill(j.rules); AL.st = j.state || {}; store("fx-app-rules", AL.rules);
      }).catch(function () {});
    }).then(function () { if (tab === "alerts") alRender(); });
  }
  function fill(r) { r = r || {}; return { t: r.t || [], s: r.s || [], m: r.m || { on: false } }; }
  var saveT;
  function alSave(now) {
    store("fx-app-rules", AL.rules);
    if (!AL.sub) return Promise.resolve();
    clearTimeout(saveT);
    return new Promise(function (res) {
      saveT = setTimeout(function () {
        postJ("/api/push/save", { sub: AL.sub.toJSON(), rules: AL.rules }).then(function (j) { AL.st = j.state || {}; $("alMsg").textContent = "저장됨 · " + hm(Math.floor(Date.now() / 60000)); res(); })
          .catch(function (e) { $("alMsg").innerHTML = '<span class="warn">저장 실패: ' + esc(e.message) + "</span>"; res(); });
      }, now ? 0 : 500);
    });
  }
  function gate(html) { $("alGate").innerHTML = '<div class="gate">' + html + "</div>"; $("alGate").hidden = false; }
  function alRender() {
    var body = $("alBody");
    if (!canPush) {
      body.hidden = true;
      if (isIOS && !standalone) return gate("<p><b>아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있습니다.</b></p><p>사파리 아래 공유 버튼 → <b>홈 화면에 추가</b> → 홈 화면의 ‘환율 조회’ 아이콘으로 열고 이 탭에서 알림을 켜 주세요(iOS 16.4 이상).</p>");
      return gate("<p>이 브라우저는 알림을 지원하지 않습니다. 안드로이드는 크롬, 아이폰은 홈 화면에 추가한 앱에서 열어 주세요.</p>");
    }
    if (!AL.ready) { body.hidden = true; return gate('<p class="muted">알림 상태 확인 중…</p>'); }
    if (Notification.permission === "denied") { body.hidden = true; return gate('<p><b class="warn">이 기기에서 알림이 차단되어 있습니다.</b></p><p>휴대폰 설정 → 앱(또는 브라우저) → 알림에서 ‘환율 조회’ 알림을 허용한 뒤 다시 열어 주세요.</p>'); }
    if (!AL.sub) {
      body.hidden = true;
      return gate("<p><b>목표 환율에 닿거나 크게 움직이면 휴대폰으로 알려 드립니다.</b></p><p class=\"muted small\">가입 없이 이 기기에서만 쓰입니다. 켜면 기본으로 아침 요약이 켜지고, 목표 환율과 급변 기준은 아래에서 정합니다.</p><button type=\"button\" class=\"btn\" id=\"alOn\">알림 켜기</button>");
    }
    $("alGate").hidden = true; body.hidden = false;
    // 목표 환율
    var tl = AL.rules.t;
    $("tList").innerHTML = tl.length ? tl.map(function (x, i) {
      var I = info(x.c), fired = AL.st.t && AL.st.t[x.id];
      var st = x.on ? "대기 중" + (I ? " · 지금 " + f1(I.now) + "원" : "") : fired ? md(fired) + " " + hm(fired) + " 도달해 꺼짐 · 다시 켤 수 있음" : "꺼짐";
      return '<li><span class="txt">' + C[x.c].name + " " + f1(x.v) + "원 " + (x.op === "ge" ? "이상" : "이하") + "<small>" + st + '</small></span><input type="checkbox" class="tg" data-ti="' + i + '"' + (x.on ? " checked" : "") + ' aria-label="켜기"><button type="button" class="x" data-td="' + i + '" aria-label="지우기">×</button></li>';
    }).join("") : '<li class="empty">아직 없습니다. 아래에서 추가하세요(최대 6개).</li>';
    // 급변
    $("sList").innerHTML = CURS.map(function (c) {
      var x = AL.rules.s.filter(function (y) { return y.c === c; })[0];
      return '<li><span class="txt">' + C[c].name + "<small>1시간에</small></span><input class=\"w\" inputmode=\"decimal\" data-sw=\"" + c + '" value="' + (x ? x.w : C[c].sw) + '" aria-label="' + C[c].name + ' 급변 기준(원)"><span class="muted small">원 이상</span><input type="checkbox" class="tg" data-so="' + c + '"' + (x && x.on ? " checked" : "") + ' aria-label="' + C[c].name + ' 급변 알림"></li>';
    }).join("");
    $("mOn").checked = !!AL.rules.m.on;
    tHint();
  }
  function tHint() {
    var c = $("tCur").value, I = info(c), v = num($("tVal").value), op = $("tOp").value;
    var h = I ? "지금 " + C[c].name + " " + f1(I.now) + "원" : "";
    if (I && isFinite(v) && ((op === "ge" && I.now >= v) || (op === "le" && I.now <= v))) h += " · 이미 조건에 닿아 있어 추가하면 1~2분 안에 바로 알림이 갑니다";
    $("tHint").textContent = h;
    if (!$("tVal").value && I) $("tVal").placeholder = f1(Math.round(I.now / (c === "jpy" ? 5 : 10)) * (c === "jpy" ? 5 : 10));
  }
  ["tCur", "tOp", "tVal"].forEach(function (id) { $(id).addEventListener("input", tHint); });
  $("alGate").addEventListener("click", function (e) {
    if (!e.target.closest("#alOn")) return;
    var b = e.target; b.disabled = true; b.textContent = "허용을 눌러 주세요…";
    Notification.requestPermission().then(function (p) {
      if (p !== "granted") { alRender(); throw new Error("알림을 허용하지 않았습니다."); }
      return swReg().then(function (reg) { return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(VAPID) }); });
    }).then(function (s) {
      AL.sub = s;
      if (!AL.rules.t.length && !AL.rules.s.length && !AL.rules.m.on) AL.rules.m.on = true;
      return alSave(true);
    }).then(function () { alRender(); toast("알림을 켰습니다. ‘테스트 알림 보내기’로 확인해 보세요."); })
      .catch(function (err) { toast(err.message || "알림을 켜지 못했습니다."); alRender(); });
  });
  $("tForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = num($("tVal").value), c = $("tCur").value;
    if (!(v > 1)) { toast("목표 환율을 숫자로 넣어 주세요."); return; }
    if (AL.rules.t.length >= 6) { toast("목표 환율은 6개까지입니다."); return; }
    var I = info(c);
    if (I && Math.abs(v / I.now - 1) > 0.3) { toast("지금 시세와 30% 넘게 차이 납니다. " + (c === "jpy" ? "엔은 100엔당 값으로 넣어 주세요." : "값을 확인해 주세요.")); return; }
    AL.rules.t.push({ id: "t" + Date.now().toString(36), c: c, op: $("tOp").value, v: Math.round(v * 100) / 100, on: true });
    $("tVal").value = ""; alRender(); alSave(true);
  });
  $("tList").addEventListener("click", function (e) {
    var d = e.target.closest("[data-td]");
    if (d) { AL.rules.t.splice(+d.getAttribute("data-td"), 1); alRender(); alSave(); }
  });
  $("tList").addEventListener("change", function (e) {
    var t = e.target.closest("[data-ti]");
    if (t) { AL.rules.t[+t.getAttribute("data-ti")].on = t.checked; alSave(); }
  });
  function swUpd(c) {
    var w = num(document.querySelector('[data-sw="' + c + '"]').value), on = document.querySelector('[data-so="' + c + '"]').checked;
    AL.rules.s = AL.rules.s.filter(function (y) { return y.c !== c; });
    if (w >= 1 && w <= 300) AL.rules.s.push({ c: c, w: w, on: on });
    else if (on) toast("급변 기준은 1~300원 사이로 넣어 주세요.");
    alSave();
  }
  $("sList").addEventListener("change", function (e) { var c = e.target.getAttribute("data-so") || e.target.getAttribute("data-sw"); if (c) swUpd(c); });
  $("mOn").addEventListener("change", function () { AL.rules.m = { on: this.checked }; alSave(); });
  $("alTest").addEventListener("click", function () {
    if (!AL.sub) return;
    var b = this; b.disabled = true;
    alSave(true).then(function () { return postJ("/api/push/test", { endpoint: AL.sub.endpoint }); })
      .then(function () { toast("테스트 알림을 보냈습니다. 몇 초 안에 도착합니다."); })
      .catch(function (e) { toast(e.message); })
      .then(function () { setTimeout(function () { b.disabled = false; }, 3000); });
  });
  $("alOff").addEventListener("click", function () {
    if (!AL.sub || !confirm("이 기기의 환율 알림을 모두 끌까요? 정해 둔 조건도 지워집니다.")) return;
    var s = AL.sub;
    postJ("/api/push/delete", { endpoint: s.endpoint }).catch(function () {}).then(function () { return s.unsubscribe(); }).then(function () {
      AL.sub = null; AL.st = {}; AL.rules = { t: [], s: [], m: { on: false } }; store("fx-app-rules", AL.rules); alRender(); toast("알림을 모두 껐습니다.");
    });
  });

  /* ---------- 더보기 ---------- */
  var newsAt = 0;
  function loadNews() {
    if (Date.now() - newsAt < 5 * 60000) return;
    getJ("/api/news").then(function (j) {
      newsAt = Date.now();
      var nowM = Math.floor(Date.now() / 60000);
      $("news").innerHTML = (j.items || []).slice(0, 10).map(function (x) {
        var a = nowM - x.m, when = a < 60 ? a + "분 전" : a < 1440 ? Math.floor(a / 60) + "시간 전" : md(x.m);
        return '<li><a href="' + esc(/^https:\/\//.test(x.u) ? x.u : "#") + '" target="_blank" rel="noopener">' + esc(x.t) + '</a><div class="meta">' + (x.lv === "긴급" ? "<b>긴급</b> · " : x.lv ? esc(x.lv) + " · " : "") + esc(x.s) + " · " + when + "</div></li>";
      }).join("") || '<li class="muted">기사가 없습니다.</li>';
    }).catch(function () { $("news").innerHTML = '<li class="muted">뉴스를 불러오지 못했습니다.</li>'; });
  }

  /* ---------- 설치 ---------- */
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; $("installBtn").hidden = false; $("installBtn2").hidden = false; });
  function install() { if (!deferred) return; deferred.prompt(); deferred.userChoice.then(function () { deferred = null; $("installBtn").hidden = true; $("installBtn2").hidden = true; }); }
  $("installBtn").addEventListener("click", install); $("installBtn2").addEventListener("click", install);
  window.addEventListener("appinstalled", function () { toast("설치했습니다. 홈 화면의 ‘환율 조회’로 여세요."); });

  /* ---------- 시작 ---------- */
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/app/sw.js", { scope: "/app/" }).catch(function () {});
  window.addEventListener("hashchange", route);
  calcInit(); renderCards(); route(); refresh(); alInit();
  try {   // 방문 기록(본 사이트와 같은 방식, 관리자 화면에서 '/app' 으로 구분)
    var vid = localStorage.getItem("fx-vid"); if (!vid) { vid = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); localStorage.setItem("fx-vid", vid); }
    navigator.sendBeacon("/api/hit", JSON.stringify({ v: vid, r: document.referrer || "", o: localStorage.getItem("fx-owner") === "1" ? 1 : 0, w: screen.width || 0, p: standalone ? "app-installed" : "app" }));
  } catch (e) {}
})();
