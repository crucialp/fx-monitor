// 문의 API (/api/contact/...) — 화면은 public/contact/index.html. 저장은 커뮤니티와 같은 D1(CDB) 의 inquiries 표(schema/inquiry.sql)
//  POST (빈 경로)                 문의 보내기 {kind,title,body,name,email,agree,hp}
//  GET  admin?st=new|done|all&off=  관리자(/admin 로그인 쿠키)만: 문의 목록(50개씩)
//  GET  admin/count               관리자만: 새 문의 개수(관리자 첫 화면 배지)
//  POST admin {action:read|new|done|delete, id}   관리자만
// 지키는 것: 같은 사이트 화면에서 보낸 JSON 만 받음, 글자로만 저장(HTML 안 받음), 도배 막기(1분 1건·1시간 3건·하루 5건),
// 커뮤니티에서 막은 IP 는 문의도 막음, IP·브라우저 정보는 90일·문의 자체는 1년 뒤 지움.
// ver2(fx-monitor-v2)도 이 코드를 그대로 쓴다(v2/functions/api/contact) — site 칸으로 구분.
import { isAdmin } from "../../../lib/auth.js";
import { isBot } from "../../../lib/botrule.js";

const KINDS = ["사이트 이용", "데이터 오류 신고", "광고·제휴", "기타"];
const MAX = { title: 80, body: 3000, name: 30, email: 100 };
const SPAM = /open\.kakao\.com|t\.me\/|텔레\s?그램|리딩\s?방|수익\s?보장|원금\s?보장|무료\s?(리딩|추천주|종목)|카지노|토토|바카라/i;
const EMAIL = /^[^\s@<>()",;:]{1,64}@[^\s@<>()",;:]{1,190}\.[a-z]{2,}$/i;
const KEEP_IP = 90 * 86400e3, KEEP_ALL = 365 * 86400e3, PAGE = 50;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
});
const fail = (msg, status = 400) => json({ error: msg }, status);

// 글자 정리: 보이지 않는 제어 문자·방향 바꾸기 문자 빼고, 줄바꿈 통일, 빈 줄은 두 줄까지만
function text(v, multiline) {
  if (typeof v !== "string") return "";
  let s = v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, "");
  s = multiline ? s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return s.trim();
}
async function body(req) {
  if (!/^application\/json\b/i.test(req.headers.get("content-type") || "")) return null;
  const t = await req.text();
  if (t.length > 16000) return null;
  try { const b = JSON.parse(t); return b && typeof b === "object" ? b : null; } catch { return null; }
}

async function sweep(db) {   // 가끔: 90일 지난 IP·브라우저 정보, 1년 지난 문의 지우기
  if (Math.random() > 0.1) return;
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE inquiries SET ip = NULL, ua = NULL WHERE ip IS NOT NULL AND created < ?").bind(now - KEEP_IP),
    db.prepare("DELETE FROM inquiries WHERE created < ?").bind(now - KEEP_ALL),
  ]);
}

async function create(ctx, b) {
  const db = ctx.env.CDB, req = ctx.request, now = Date.now();
  const ip = req.headers.get("cf-connecting-ip") || "0.0.0.0";
  const kind = KINDS.includes(b.kind) ? b.kind : "";
  const title = text(b.title), bd = text(b.body, true), name = text(b.name), email = text(b.email);
  if (!kind) return fail("문의 종류를 골라 주세요.");
  if (!title) return fail("제목을 적어 주세요.");
  if (title.length > MAX.title) return fail(`제목은 ${MAX.title}자까지입니다.`);
  if (bd.length < 5) return fail("내용을 조금 더 적어 주세요.");
  if (bd.length > MAX.body) return fail(`내용은 ${MAX.body.toLocaleString()}자까지입니다.`);
  if (name.length > MAX.name) return fail(`이름은 ${MAX.name}자까지입니다.`);
  if (email && (email.length > MAX.email || !EMAIL.test(email))) return fail("이메일 주소 형식을 확인해 주세요.");
  if (b.agree !== true) return fail("개인정보 수집·이용에 동의해야 보낼 수 있습니다.");
  if (SPAM.test(title + "\n" + bd)) return fail("홍보성 문구가 들어 있어 보낼 수 없습니다.");
  const [ban, burst, hour, day] = await db.batch([
    db.prepare("SELECT reason FROM bans WHERE ip = ?").bind(ip),
    db.prepare("SELECT COUNT(*) n FROM inquiries WHERE ip = ? AND created > ?").bind(ip, now - 60e3),
    db.prepare("SELECT COUNT(*) n FROM inquiries WHERE ip = ? AND created > ?").bind(ip, now - 3600e3),
    db.prepare("SELECT COUNT(*) n FROM inquiries WHERE ip = ? AND created > ?").bind(ip, now - 86400e3),
  ]);
  if (ban.results.length) return fail("이 접속은 운영 원칙 위반으로 막혀 있습니다.", 403);
  if (burst.results[0].n > 0) return fail("문의는 1분에 한 번만 보낼 수 있습니다.", 429);
  if (hour.results[0].n >= 3) return fail("문의는 1시간에 3건까지 보낼 수 있습니다.", 429);
  if (day.results[0].n >= 5) return fail("오늘은 더 보낼 수 없습니다. 내일 다시 보내 주세요.", 429);
  const site = /fx-monitor-v2/.test(new URL(req.url).hostname) ? "v2" : "fx";
  const ua = (req.headers.get("user-agent") || "").slice(0, 300);
  const r = await db.prepare("INSERT INTO inquiries (site, kind, title, body, name, email, ip, ua, created) VALUES (?,?,?,?,?,?,?,?,?)")
    .bind(site, kind, title, bd, name || null, email || null, ip, ua, now).run();
  ctx.waitUntil(sweep(db).catch(() => {}));
  return json({ id: r.meta.last_row_id });
}

async function adminList(ctx) {
  const db = ctx.env.CDB, u = new URL(ctx.request.url);
  const st = u.searchParams.get("st") || "all", off = Math.min(Math.max(Math.floor(+u.searchParams.get("off") || 0), 0), 100000);
  const where = st === "new" ? "WHERE status = 0" : st === "open" ? "WHERE status < 2" : st === "done" ? "WHERE status = 2" : "";
  const [rows, cnt] = await db.batch([
    db.prepare(`SELECT id, site, kind, title, body, name, email, ip, ua, created, status FROM inquiries ${where} ORDER BY id DESC LIMIT ${PAGE + 1} OFFSET ${off}`),
    db.prepare("SELECT status, COUNT(*) n FROM inquiries GROUP BY status"),
  ]);
  const by = { 0: 0, 1: 0, 2: 0 };
  for (const x of cnt.results) by[x.status] = x.n;
  return json({ items: rows.results.slice(0, PAGE), more: rows.results.length > PAGE, counts: { new: by[0], read: by[1], done: by[2] } });
}

async function adminAct(ctx, b) {
  const db = ctx.env.CDB, id = Math.floor(+b.id || 0);
  if (!(id > 0)) return fail("잘못된 요청입니다.");
  const set = { read: 1, new: 0, done: 2 }[b.action];
  if (set != null) await db.prepare("UPDATE inquiries SET status = ? WHERE id = ?").bind(set, id).run();
  else if (b.action === "delete") await db.prepare("DELETE FROM inquiries WHERE id = ?").bind(id).run();
  else return fail("잘못된 요청입니다.");
  return json({ ok: true });
}

export async function onRequest(ctx) {
  const req = ctx.request, seg = [].concat(ctx.params.path || []);
  try {
    if (req.method === "GET") {
      if (seg[0] !== "admin") return fail("없는 주소입니다.", 404);
      if (!(await isAdmin(ctx))) return fail("관리자만 볼 수 있습니다.", 401);
      if (seg[1] === "count") {
        const r = await ctx.env.CDB.prepare("SELECT COUNT(*) n FROM inquiries WHERE status = 0").first();
        return json({ new: r ? r.n : 0 });
      }
      return await adminList(ctx);
    }
    if (req.method !== "POST") return fail("허용하지 않는 요청입니다.", 405);
    if (req.headers.get("origin") !== new URL(req.url).origin) return fail("잘못된 요청입니다.", 403);   // 다른 사이트가 몰래 보내는 요청 막기
    const b = await body(req);
    if (!b) return fail("잘못된 요청입니다.");
    if (seg[0] === "admin" && seg.length === 1) return (await isAdmin(ctx)) ? await adminAct(ctx, b) : fail("관리자만 할 수 있습니다.", 401);
    if (seg.length) return fail("없는 주소입니다.", 404);
    if (b.hp) return json({ id: 0 });                                     // 사람 눈에 안 보이는 칸을 채운 자동 전송
    if (isBot(req.headers.get("user-agent") || "", "")) return fail("자동 접속으로는 보낼 수 없습니다.", 403);
    return await create(ctx, b);
  } catch (e) {
    return fail("잠시 문제가 생겼습니다. 조금 뒤 다시 보내 주세요.", 500);
  }
}
