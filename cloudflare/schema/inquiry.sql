-- 문의(/contact/) — 2026-11-17. 커뮤니티와 같은 D1(fx-community). 운영자만 /admin/inquiries 에서 읽는다.
-- IP·브라우저 정보는 스팸 대응용으로만 두고 90일 뒤 지운다(NULL). 문의 자체(이름·이메일 포함)는 1년 뒤 지운다.
CREATE TABLE IF NOT EXISTS inquiries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site TEXT NOT NULL,                       -- fx(본 사이트) | v2(상업용 시안)
  kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
  name TEXT, email TEXT,
  ip TEXT, ua TEXT,
  created INTEGER NOT NULL,
  status INTEGER NOT NULL DEFAULT 0          -- 0 새 문의, 1 읽음, 2 처리 완료
);
CREATE INDEX IF NOT EXISTS inquiries_list ON inquiries (status, id DESC);
CREATE INDEX IF NOT EXISTS inquiries_ip ON inquiries (ip, created);
