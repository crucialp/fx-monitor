/* 문의 화면 — 보내기만 한다(읽기는 운영자 /admin/inquiries). 화면 글자는 모두 textContent 로 넣는다. */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var f = $("f"), err = $("ferr"), send = $("fsend");
  function count() { $("fcount").textContent = $("fbody").value.length.toLocaleString("en-US") + " / 3,000"; }
  $("fbody").addEventListener("input", count);
  count();
  f.addEventListener("submit", function (ev) {
    ev.preventDefault();
    err.textContent = "";
    var k = f.querySelector('input[name="kind"]:checked');
    var b = { kind: k ? k.value : "", title: $("ftitle").value, body: $("fbody").value, name: $("fname").value, email: $("femail").value, agree: $("fagree").checked, hp: $("fhp").value };
    if (!b.kind) { err.textContent = "문의 종류를 골라 주세요."; return; }
    if (!b.title.trim()) { err.textContent = "제목을 적어 주세요."; $("ftitle").focus(); return; }
    if (b.body.trim().length < 5) { err.textContent = "내용을 조금 더 적어 주세요."; $("fbody").focus(); return; }
    if (!b.agree) { err.textContent = "개인정보 수집·이용에 동의해야 보낼 수 있습니다."; return; }
    send.disabled = true; send.textContent = "보내는 중…";
    fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin", body: JSON.stringify(b) })
      .then(function (r) { return r.json().catch(function () { return { error: "잠시 문제가 생겼습니다. 조금 뒤 다시 보내 주세요." }; }); })
      .then(function (j) {
        if (j.error) { err.textContent = j.error; return; }
        f.hidden = true; $("done").hidden = false;
        $("donemsg").textContent = (j.id ? "접수 번호 " + j.id + " · " : "") + (b.email.trim() ? "적어 주신 이메일로 답장드리겠습니다." : "이메일을 적지 않으셔서 따로 답장은 드리지 못합니다. 보내 주신 내용은 운영자가 확인합니다.");
        f.reset(); count();
      })
      .catch(function () { err.textContent = "보내지 못했습니다. 인터넷 연결을 확인하고 다시 보내 주세요."; })
      .then(function () { send.disabled = false; send.textContent = "보내기"; });
  });
  $("again").addEventListener("click", function () { $("done").hidden = true; f.hidden = false; $("ftitle").focus(); });
})();
