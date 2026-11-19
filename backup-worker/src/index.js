// 1분마다 Wise 시장 중간 환율(USD·JPY·EUR → KRW)을 D1 fx_backup 에 기록. 5일 지난 기록은 매시 7분에 지운다.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const CURS = ["USD", "JPY", "EUR"];

// rates/live 는 Workers 에서 값이 안 와서(2026-11-19 확인) history+live 의 마지막 항목(= 지금 값)을 쓴다.
async function live(src) {
  let why = "";
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(`https://wise.com/rates/history+live?source=${src}&target=KRW&length=1&resolution=hourly&unit=day`, {
        headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) { why = "HTTP " + r.status; continue; }
      const a = await r.json(), x = Array.isArray(a) && a[a.length - 1];
      if (x && Number.isFinite(x.value) && x.value > 0) return x.value;
      why = "빈 응답";
    } catch (e) { why = String(e && e.message || e); }
  }
  console.log(`wise ${src} 실패: ${why}`);
  return null;
}

export default {
  async scheduled(event, env) {
    const m = Math.floor((event.scheduledTime || Date.now()) / 60000);
    const vals = await Promise.all(CURS.map(live));
    const st = env.DB.prepare("INSERT OR REPLACE INTO fx_backup (cur, m, v) VALUES (?, ?, ?)");
    const batch = [];
    CURS.forEach((c, i) => { if (vals[i] !== null) batch.push(st.bind(c, m, vals[i])); });
    if (m % 60 === 7) batch.push(env.DB.prepare("DELETE FROM fx_backup WHERE m < ?").bind(m - 5 * 1440));
    if (batch.length) await env.DB.batch(batch);
  },
};
