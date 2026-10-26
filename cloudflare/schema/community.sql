-- 커뮤니티(가입 없이 닉네임+비밀번호). IP 는 스팸·불법 게시물 대응용으로만 두고 90일 뒤 지운다(NULL).
-- 비밀번호는 HMAC(COMMUNITY_KEY, 소금+비밀번호)만 저장. who = IP 의 HMAC(추천·신고 중복 막기용, 원래 IP 아님).
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cat TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  nick TEXT NOT NULL, tag TEXT, admin INTEGER NOT NULL DEFAULT 0,
  pw TEXT NOT NULL, ip TEXT, ua TEXT,
  created INTEGER NOT NULL, updated INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0,          -- 0 보임, 1 관리자가 숨김, 2 신고 누적으로 자동 숨김(관리자 확인 대기)
  views INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS posts_list ON posts (hidden, id DESC);
CREATE INDEX IF NOT EXISTS posts_cat ON posts (cat, hidden, id DESC);
CREATE INDEX IF NOT EXISTS posts_ip ON posts (ip, created);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post INTEGER NOT NULL, body TEXT NOT NULL,
  nick TEXT NOT NULL, tag TEXT, admin INTEGER NOT NULL DEFAULT 0,
  pw TEXT NOT NULL, ip TEXT, ua TEXT,
  created INTEGER NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS comments_post ON comments (post, id);
CREATE INDEX IF NOT EXISTS comments_ip ON comments (ip, created);
CREATE TABLE IF NOT EXISTS likes (post INTEGER NOT NULL, who TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (post, who));
CREATE TABLE IF NOT EXISTS reports (kind TEXT NOT NULL, ref INTEGER NOT NULL, who TEXT NOT NULL, reason TEXT, created INTEGER NOT NULL, PRIMARY KEY (kind, ref, who));
CREATE TABLE IF NOT EXISTS bans (ip TEXT PRIMARY KEY, reason TEXT, created INTEGER NOT NULL);
