// 커뮤니티 API (/api/community/...) — 가입 없이 닉네임+비밀번호로 글·댓글. 화면은 public/community/index.html
//  GET  posts?cat=&q=&before=          글 목록(20개씩, 공지는 첫 쪽 맨 위)
//  GET  post/:id?v=1                   글 하나 + 댓글(v=1 이면 조회수 +1)
//  POST posts                          글쓰기 {cat,title,body,nick,pw,hp}
//  POST post/:id/edit | delete | like | comments
//  POST comment/:id/delete             댓글 지우기 {pw}
//  POST report {kind,id,reason}        신고(같은 사람은 한 번, 서로 다른 3명이 신고하면 자동으로 가림)
//  GET  admin/queue · POST admin {action,kind,id}   관리자(/admin 로그인 쿠키)만: 숨김·보이기·IP 차단·차단 풀기
// 지키는 것: 같은 사이트에서 온 JSON 요청만 받음, 글은 글자로만 저장·표시(HTML 안 받음), IP 는 90일 뒤 지움,
// 비밀번호는 HMAC(COMMUNITY_KEY) 로만 저장, 도배·홍보(리딩방·오픈채팅·전화번호) 막기.
import { isAdmin } from "../../../lib/auth.js";
import { isBot } from "../../../lib/botrule.js";

const CATS = ["환율", "금리", "자유", "질문"];          // '공지'는 관리자만
const MAX = { nick: 12, title: 80, body: 5000, cbody: 1000, pw: 64, reason: 200 };
const SPAM = /open\.kakao\.com|t\.me\/|텔레\s?그램|리딩\s?방|수익\s?보장|원금\s?보장|카톡\s?(문의|상담)|오픈\s?채팅|단톡방|010[-.\s]?\d{3,4}[-.\s]?\d{4}|무료\s?(리딩|추천주|종목)/i;
const RESERVED = /운영자|관리자|운영진|사이트\s*주인|admin|moderator/i;
const URLS = /https?:\/\/[^\s<>"]+/gi;
const KEEP_IP = 90 * 86400e3;
const enc = new TextEncoder();

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
});
const fail = (msg, status = 400) => json({ error: msg }, status);

async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function same(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function hashPw(key, pw) {
  const salt = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return salt + "$" + (await hmacHex(key, "pw|" + salt + "|" + pw));
}
async function checkPw(key, stored, pw) {
  const [salt, h] = String(stored || "").split("$");
  if (!salt || !h || typeof pw !== "string" || !pw) return false;
  return same(await hmacHex(key, "pw|" + salt + "|" + pw), h);
}

// 글자 정리: 보이지 않는 제어 문자·방향 바꾸기 문자 빼고, 줄바꿈 통일, 빈 줄은 두 줄까지만
function text(v, multiline) {
  if (typeof v !== "string") return "";
  let s = v.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, "");
  s = multiline ? s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n") : s.replace(/\s+/g, " ");
  return s.trim();
}

async function who(ctx) {   // 이 접속자를 가리키는 값(원래 IP 아님): 추천·신고 중복 막기, 닉네임 옆 4글자 표시
  const ip = ctx.request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const h = await hmacHex(ctx.env.COMMUNITY_KEY, "who|" + ip);
  return { ip, who: h.slice(0, 24), tag: h.slice(0, 4) };
}

async function body(req) {
  if (!/^application\/json\b/i.test(req.headers.get("content-type") || "")) return null;
  const t = await req.text();
  if (t.length > 24000) return null;
  try { const b = JSON.parse(t); return b && typeof b === "object" ? b : null; } catch { return null; }
}

// 쓰기 전에 공통으로: 차단된 IP 인지, 너무 자주 쓰는지
async function guard(db, ip, kind) {
  const now = Date.now();
  const tbl = kind === "post" ? "posts" : "comments";
  const [ban, burst, hour, day] = await db.batch([
    db.prepare("SELECT reason FROM bans WHERE ip = ?").bind(ip),
    db.prepare(`SELECT COUNT(*) n FROM ${tbl} WHERE ip = ? AND created > ?`).bind(ip, now - (kind === "post" ? 60e3 : 15e3)),
    db.prepare(`SELECT COUNT(*) n FROM ${tbl} WHERE ip = ? AND created > ?`).bind(ip, now - 3600e3),
    db.prepare(`SELECT COUNT(*) n FROM ${tbl} WHERE ip = ? AND created > ?`).bind(ip, now - 86400e3),
  ]);
  if (ban.results.length) return "이 접속은 운영 원칙 위반으로 글쓰기가 막혀 있습니다.";
  if (burst.results[0].n > 0) return kind === "post" ? "글은 1분에 한 번만 쓸 수 있습니다." : "댓글은 15초에 한 번만 쓸 수 있습니다.";
  if (hour.results[0].n >= (kind === "post" ? 5 : 30)) return kind === "post" ? "글은 1시간에 5개까지 쓸 수 있습니다." : "댓글은 1시간에 30개까지 쓸 수 있습니다.";
  if (day.results[0].n >= (kind === "post" ? 20 : 150)) return "오늘은 더 쓸 수 없습니다. 내일 다시 써 주세요.";
  return null;
}

function checkContent(t, admin) {
  if (admin) return null;
  if (SPAM.test(t)) return "연락처(전화번호·오픈채팅·텔레그램)나 리딩방·수익 보장 같은 홍보 문구는 쓸 수 없습니다.";
  if ((t.match(URLS) || []).length > 3) return "링크는 한 글에 3개까지 넣을 수 있습니다.";
  return null;
}

async function author(ctx, b, admin) {   // 닉네임·비밀번호 확인 → {nick, tag, pw}
  if (admin) return { nick: "운영자", tag: null, pw: await hashPw(ctx.env.COMMUNITY_KEY, crypto.randomUUID()) };
  const nick = text(b.nick), pw = typeof b.pw === "string" ? b.pw : "";
  if (!nick) return { error: "닉네임을 적어 주세요." };
  if (nick.length > MAX.nick) return { error: `닉네임은 ${MAX.nick}자까지입니다.` };
  if (RESERVED.test(nick)) return { error: "그 닉네임은 쓸 수 없습니다." };
  if (pw.length < 4 || pw.length > MAX.pw) return { error: "비밀번호는 4자 이상으로 적어 주세요(글을 고치거나 지울 때 씁니다)." };
  return { nick, pw: await hashPw(ctx.env.COMMUNITY_KEY, pw) };
}

function postFields(b, admin) {
  const cat = typeof b.cat === "string" ? b.cat : "";
  if (!(CATS.includes(cat) || (admin && cat === "공지"))) return { error: "말머리를 골라 주세요." };
  const title = text(b.title), bd = text(b.body, true);
  if (!title) return { error: "제목을 적어 주세요." };
  if (title.length > MAX.title) return { error: `제목은 ${MAX.title}자까지입니다.` };
  if (!bd) return { error: "내용을 적어 주세요." };
  if (bd.length > MAX.body) return { error: `내용은 ${MAX.body.toLocaleString()}자까지입니다.` };
  const bad = checkContent(title + "\n" + bd, admin);
  if (bad) return { error: bad };
  return { cat, title, body: bd };
}

async function sweep(ctx) {   // 가끔: 90일 지난 IP·브라우저 정보 지우기
  if (Math.random() > 0.05) return;
  const db = ctx.env.CDB, old = Date.now() - KEEP_IP;
  await db.batch([
    db.prepare("UPDATE posts SET ip = NULL, ua = NULL WHERE ip IS NOT NULL AND created < ?").bind(old),
    db.prepare("UPDATE comments SET ip = NULL, ua = NULL WHERE ip IS NOT NULL AND created < ?").bind(old),
    db.prepare("DELETE FROM reports WHERE created < ?").bind(old),
  ]);
}

const LIST_COLS = "p.id, p.cat, p.title, p.nick, p.tag, p.admin, p.created, p.updated, p.views, p.likes, p.hidden, p.reports, (SELECT COUNT(*) FROM comments c WHERE c.post = p.id AND c.hidden = 0) nc";

async function listPosts(ctx, admin) {
  const db = ctx.env.CDB, u = new URL(ctx.request.url);
  const cat = u.searchParams.get("cat") || "", q = text(u.searchParams.get("q") || "").slice(0, 40), before = +u.searchParams.get("before") || 0;
  const where = [admin ? "1 = 1" : "p.hidden = 0", "p.cat != '공지'"], args = [];
  if (CATS.includes(cat)) { where.push("p.cat = ?"); args.push(cat); }
  if (q) { where.push("(p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')"); const l = "%" + q.replace(/[\\%_]/g, (m) => "\\" + m) + "%"; args.push(l, l); }
  if (before > 0) { where.push("p.id < ?"); args.push(before); }
  const stmts = [db.prepare(`SELECT ${LIST_COLS} FROM posts p WHERE ${where.join(" AND ")} ORDER BY p.id DESC LIMIT 21`).bind(...args)];
  const first = !before && !q && !cat;
  if (first) stmts.push(db.prepare(`SELECT ${LIST_COLS} FROM posts p WHERE p.cat = '공지' AND ${admin ? "1 = 1" : "p.hidden = 0"} ORDER BY p.id DESC LIMIT 3`));
  const [list, notes] = await db.batch(stmts);
  const items = list.results.slice(0, 20);
  return json({ items, notices: first ? notes.results : [], more: list.results.length > 20, me: { admin } });
}

async function getPost(ctx, id, admin) {
  const db = ctx.env.CDB, me = await who(ctx);
  const [p, cs, lk] = await db.batch([
    db.prepare(`SELECT id, cat, title, body, nick, tag, admin, created, updated, views, likes, hidden, reports${admin ? ", ip" : ""} FROM posts WHERE id = ?`).bind(id),
    db.prepare(`SELECT id, body, nick, tag, admin, created, hidden, reports${admin ? ", ip" : ""} FROM comments WHERE post = ?${admin ? "" : " AND hidden = 0"} ORDER BY id LIMIT 500`).bind(id),
    db.prepare("SELECT 1 FROM likes WHERE post = ? AND who = ?").bind(id, me.who),
  ]);
  const post = p.results[0];
  if (!post) return fail("없는 글이거나 지워진 글입니다.", 404);
  if (post.hidden && !admin) return fail(post.hidden === 2 ? "신고가 여러 번 들어와 운영자 확인 전까지 가려 둔 글입니다." : "운영 원칙에 따라 가려진 글입니다.", 410);
  if (new URL(ctx.request.url).searchParams.get("v") === "1") {
    ctx.waitUntil(db.prepare("UPDATE posts SET views = views + 1 WHERE id = ?").bind(id).run().catch(() => {}));
    post.views += 1;
  }
  return json({ post, comments: cs.results, liked: lk.results.length > 0, me: { admin } });
}

async function createPost(ctx, b, admin) {
  const db = ctx.env.CDB, me = await who(ctx);
  if (!admin) { const g = await guard(db, me.ip, "post"); if (g) return fail(g, 429); }
  const f = postFields(b, admin); if (f.error) return fail(f.error);
  const a = await author(ctx, b, admin); if (a.error) return fail(a.error);
  const r = await db.prepare("INSERT INTO posts (cat, title, body, nick, tag, admin, pw, ip, ua, created) VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id")
    .bind(f.cat, f.title, f.body, a.nick, admin ? null : me.tag, admin ? 1 : 0, a.pw, me.ip, (ctx.request.headers.get("user-agent") || "").slice(0, 300), Date.now()).first();
  ctx.waitUntil(sweep(ctx).catch(() => {}));
  return json({ id: r.id });
}

async function ownPost(ctx, id, b, admin) {   // 비밀번호가 맞거나 관리자면 글을 돌려준다
  const p = await ctx.env.CDB.prepare("SELECT id, pw, admin, hidden FROM posts WHERE id = ?").bind(id).first();
  if (!p) return { error: fail("없는 글이거나 이미 지워진 글입니다.", 404) };
  if (admin || (await checkPw(ctx.env.COMMUNITY_KEY, p.pw, b.pw))) return { p };
  return { error: fail("비밀번호가 맞지 않습니다.", 403) };
}

async function editPost(ctx, id, b, admin) {
  const o = await ownPost(ctx, id, b, admin); if (o.error) return o.error;
  if (admin && !o.p.admin && !(await checkPw(ctx.env.COMMUNITY_KEY, o.p.pw, b.pw))) return fail("다른 사람의 글은 고칠 수 없습니다(가리기·지우기만 됩니다).", 403);
  const f = postFields(b, admin && o.p.admin); if (f.error) return fail(f.error);
  await ctx.env.CDB.prepare("UPDATE posts SET cat = ?, title = ?, body = ?, updated = ? WHERE id = ?").bind(f.cat, f.title, f.body, Date.now(), id).run();
  return json({ id });
}

async function deletePost(ctx, id, b, admin) {
  const o = await ownPost(ctx, id, b, admin); if (o.error) return o.error;
  const db = ctx.env.CDB;
  await db.batch([
    db.prepare("DELETE FROM reports WHERE (kind = 'post' AND ref = ?) OR (kind = 'comment' AND ref IN (SELECT id FROM comments WHERE post = ?))").bind(id, id),
    db.prepare("DELETE FROM comments WHERE post = ?").bind(id),
    db.prepare("DELETE FROM likes WHERE post = ?").bind(id),
    db.prepare("DELETE FROM posts WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
}

async function addComment(ctx, id, b, admin) {
  const db = ctx.env.CDB, me = await who(ctx);
  const p = await db.prepare("SELECT hidden FROM posts WHERE id = ?").bind(id).first();
  if (!p || (p.hidden && !admin)) return fail("댓글을 달 수 없는 글입니다.", 404);
  if (!admin) { const g = await guard(db, me.ip, "comment"); if (g) return fail(g, 429); }
  const t = text(b.body, true);
  if (!t) return fail("댓글 내용을 적어 주세요.");
  if (t.length > MAX.cbody) return fail(`댓글은 ${MAX.cbody.toLocaleString()}자까지입니다.`);
  const bad = checkContent(t, admin); if (bad) return fail(bad);
  const a = await author(ctx, b, admin); if (a.error) return fail(a.error);
  const r = await db.prepare("INSERT INTO comments (post, body, nick, tag, admin, pw, ip, ua, created) VALUES (?,?,?,?,?,?,?,?,?) RETURNING id")
    .bind(id, t, a.nick, admin ? null : me.tag, admin ? 1 : 0, a.pw, me.ip, (ctx.request.headers.get("user-agent") || "").slice(0, 300), Date.now()).first();
  ctx.waitUntil(sweep(ctx).catch(() => {}));
  return json({ id: r.id });
}

async function deleteComment(ctx, id, b, admin) {
  const db = ctx.env.CDB;
  const c = await db.prepare("SELECT pw FROM comments WHERE id = ?").bind(id).first();
  if (!c) return fail("없는 댓글이거나 이미 지워진 댓글입니다.", 404);
  if (!admin && !(await checkPw(ctx.env.COMMUNITY_KEY, c.pw, b.pw))) return fail("비밀번호가 맞지 않습니다.", 403);
  await db.batch([db.prepare("DELETE FROM reports WHERE kind = 'comment' AND ref = ?").bind(id), db.prepare("DELETE FROM comments WHERE id = ?").bind(id)]);
  return json({ ok: true });
}

async function like(ctx, id) {
  const db = ctx.env.CDB, me = await who(ctx);
  const p = await db.prepare("SELECT hidden FROM posts WHERE id = ?").bind(id).first();
  if (!p || p.hidden) return fail("없는 글입니다.", 404);
  const r = await db.prepare("INSERT OR IGNORE INTO likes (post, who, created) VALUES (?,?,?)").bind(id, me.who, Date.now()).run();
  if (r.meta.changes) await db.prepare("UPDATE posts SET likes = likes + 1 WHERE id = ?").bind(id).run();
  const n = await db.prepare("SELECT likes FROM posts WHERE id = ?").bind(id).first();
  return json({ likes: n.likes, liked: true, already: !r.meta.changes });
}

async function report(ctx, b) {
  const db = ctx.env.CDB, me = await who(ctx);
  const kind = b.kind === "comment" ? "comment" : b.kind === "post" ? "post" : "", id = +b.id || 0;
  if (!kind || !id) return fail("신고할 글을 찾지 못했습니다.");
  const tbl = kind === "post" ? "posts" : "comments";
  if (!(await db.prepare(`SELECT 1 FROM ${tbl} WHERE id = ?`).bind(id).first())) return fail("없는 글이거나 이미 지워진 글입니다.", 404);
  const reason = text(b.reason || "").slice(0, MAX.reason) || null;
  const r = await db.prepare("INSERT OR IGNORE INTO reports (kind, ref, who, reason, created) VALUES (?,?,?,?,?)").bind(kind, id, me.who, reason, Date.now()).run();
  if (r.meta.changes) {
    await db.batch([
      db.prepare(`UPDATE ${tbl} SET reports = reports + 1 WHERE id = ?`).bind(id),
      db.prepare(`UPDATE ${tbl} SET hidden = 2 WHERE id = ? AND hidden = 0 AND reports >= 3`).bind(id),
    ]);
  }
  return json({ ok: true, already: !r.meta.changes });
}

async function adminQueue(ctx) {
  const db = ctx.env.CDB;
  const [ps, cs, rs, bans] = await db.batch([
    db.prepare("SELECT id, cat, title, nick, tag, created, hidden, reports, ip FROM posts WHERE hidden > 0 OR reports > 0 ORDER BY id DESC LIMIT 200"),
    db.prepare("SELECT c.id, c.post, c.body, c.nick, c.tag, c.created, c.hidden, c.reports, c.ip, p.title FROM comments c LEFT JOIN posts p ON p.id = c.post WHERE c.hidden > 0 OR c.reports > 0 ORDER BY c.id DESC LIMIT 200"),
    db.prepare("SELECT kind, ref, reason, created FROM reports WHERE reason IS NOT NULL ORDER BY created DESC LIMIT 300"),
    db.prepare("SELECT ip, reason, created FROM bans ORDER BY created DESC LIMIT 200"),
  ]);
  return json({ posts: ps.results, comments: cs.results, reasons: rs.results, bans: bans.results });
}

async function adminAct(ctx, b) {
  const db = ctx.env.CDB;
  const kind = b.kind === "comment" ? "comments" : "posts", id = +b.id || 0;
  if (b.action === "hide") await db.prepare(`UPDATE ${kind} SET hidden = 1 WHERE id = ?`).bind(id).run();
  else if (b.action === "unhide") {
    await db.batch([
      db.prepare(`UPDATE ${kind} SET hidden = 0, reports = 0 WHERE id = ?`).bind(id),
      db.prepare("DELETE FROM reports WHERE kind = ? AND ref = ?").bind(kind === "posts" ? "post" : "comment", id),
    ]);
  } else if (b.action === "ban") {
    const row = await db.prepare(`SELECT ip FROM ${kind} WHERE id = ?`).bind(id).first();
    if (!row || !row.ip) return fail("이 글의 IP 가 남아 있지 않습니다(90일이 지났거나 지워짐).");
    await db.prepare("INSERT OR REPLACE INTO bans (ip, reason, created) VALUES (?,?,?)").bind(row.ip, text(b.reason || "").slice(0, 200) || null, Date.now()).run();
    await db.prepare(`UPDATE ${kind} SET hidden = 1 WHERE id = ?`).bind(id).run();
  } else if (b.action === "unban") {
    await db.prepare("DELETE FROM bans WHERE ip = ?").bind(String(b.ip || "")).run();
  } else return fail("모르는 작업입니다.");
  return json({ ok: true });
}

export async function onRequest(ctx) {
  const { request: req, env } = ctx;
  if (!env.CDB || !env.COMMUNITY_KEY) return fail("커뮤니티 준비 중입니다.", 503);
  const seg = [].concat(ctx.params.path || []);
  const admin = await isAdmin(ctx);
  try {
    if (req.method === "GET") {
      if (seg[0] === "posts" && seg.length === 1) return await listPosts(ctx, admin);
      if (seg[0] === "post" && +seg[1] > 0 && seg.length === 2) return await getPost(ctx, +seg[1], admin);
      if (seg[0] === "me") return json({ admin });
      if (seg[0] === "admin" && seg[1] === "queue") return admin ? await adminQueue(ctx) : fail("관리자만 볼 수 있습니다.", 401);
      return fail("없는 주소입니다.", 404);
    }
    if (req.method !== "POST") return fail("허용하지 않는 요청입니다.", 405);
    // 쓰기는 이 사이트 화면에서 보낸 JSON 만(다른 사이트가 몰래 보내는 요청 막기)
    if (req.headers.get("origin") !== new URL(req.url).origin) return fail("잘못된 요청입니다.", 403);
    const b = await body(req);
    if (!b) return fail("잘못된 요청입니다.");
    if (b.hp) return json({ id: 0 });                                     // 사람 눈에 안 보이는 칸을 채운 자동 글쓰기
    if (!admin && isBot(req.headers.get("user-agent") || "", "")) return fail("자동 접속으로는 쓸 수 없습니다.", 403);
    const id = +seg[1] || 0;
    if (seg[0] === "posts" && seg.length === 1) return await createPost(ctx, b, admin);
    if (seg[0] === "post" && id > 0) {
      if (seg[2] === "edit") return await editPost(ctx, id, b, admin);
      if (seg[2] === "delete") return await deletePost(ctx, id, b, admin);
      if (seg[2] === "like") return await like(ctx, id);
      if (seg[2] === "comments") return await addComment(ctx, id, b, admin);
    }
    if (seg[0] === "comment" && id > 0 && seg[2] === "delete") return await deleteComment(ctx, id, b, admin);
    if (seg[0] === "report") return await report(ctx, b);
    if (seg[0] === "admin" && seg.length === 1) return admin ? await adminAct(ctx, b) : fail("관리자만 할 수 있습니다.", 401);
    return fail("없는 주소입니다.", 404);
  } catch (e) {
    return fail("잠시 문제가 생겼습니다. 조금 뒤 다시 해 주세요.", 500);
  }
}
