CREATE TABLE IF NOT EXISTS leaderboard_scores (
  username_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  achieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS leaderboard_rank_idx
ON leaderboard_scores (score DESC, achieved_at ASC, username_key ASC);
