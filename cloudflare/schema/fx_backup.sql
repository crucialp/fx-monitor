-- Yahoo 1분 시세가 끊길 때 메울 예비 시세: Wise 시장 중간 환율을 1분마다 기록(backup-worker), 5일 보관
CREATE TABLE IF NOT EXISTS fx_backup (
  cur TEXT NOT NULL,      -- USD / JPY / EUR (대 원화, JPY 는 1엔당)
  m   INTEGER NOT NULL,   -- 기록 시각(epoch 분)
  v   REAL NOT NULL,
  PRIMARY KEY (cur, m)
);
