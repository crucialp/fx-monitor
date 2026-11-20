-- 앱(/app/) 환율 알림 구독. 가입 없이 브라우저의 알림 구독 주소(endpoint)가 곧 신원이다.
-- 조건 확인·발송은 backup-worker 가 매분 한다. 앱을 180일 동안 안 열면 지운다.
CREATE TABLE IF NOT EXISTS push_sub (
  id       TEXT PRIMARY KEY,   -- endpoint 의 SHA-256 앞 32자
  endpoint TEXT NOT NULL,
  p256dh   TEXT NOT NULL,
  auth     TEXT NOT NULL,
  rules    TEXT NOT NULL,      -- {t:[목표 환율], s:[급변], m:{on}} JSON
  state    TEXT NOT NULL DEFAULT '{}',   -- 서버가 쓰는 발송 기록 {t:{id:분}, s:{통화:분}, m:"날짜", test:분}
  act      INTEGER NOT NULL DEFAULT 0,   -- 켜진 알림이 하나라도 있으면 1(매분 이것만 읽는다)
  created  INTEGER NOT NULL,
  seen     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS push_sub_act ON push_sub(act);
