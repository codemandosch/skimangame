const USERNAME_PATTERN = /^[A-Za-z0-9 _-]{1,16}$/;
const MAX_SCORE = 1_000_000_000;

const TOP_TEN_SQL = `SELECT username_key, username, score, achieved_at
FROM leaderboard_scores
ORDER BY score DESC, achieved_at ASC, username_key ASC
LIMIT 10`;

const EXISTING_SQL = `SELECT username_key, username, score, achieved_at
FROM leaderboard_scores
WHERE username_key = ?`;

const UPSERT_SQL = `INSERT INTO leaderboard_scores (username_key, username, score, achieved_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(username_key) DO UPDATE SET
  username = excluded.username,
  score = excluded.score,
  achieved_at = CURRENT_TIMESTAMP
WHERE excluded.score > leaderboard_scores.score`;

const PRUNE_SQL = `DELETE FROM leaderboard_scores
WHERE username_key NOT IN (
  SELECT username_key FROM leaderboard_scores
  ORDER BY score DESC, achieved_at ASC, username_key ASC
  LIMIT 10
)`;

export function normalizeUsername(value) {
  const username = String(value ?? '').trim();
  if (!USERNAME_PATTERN.test(username)) throw new Error('Invalid username');
  return { username, usernameKey: username.toLowerCase() };
}

export function validateScore(value) {
  if (!Number.isInteger(value) || value < 0 || value > MAX_SCORE) throw new Error('Invalid score');
  return value;
}

export async function getTopTen(db) {
  const { results = [] } = await db.prepare(TOP_TEN_SQL).all();
  return results.map((row, index) => ({ rank: index + 1, username: row.username, score: row.score }));
}

export async function submitBestScore(db, submission) {
  const { username, usernameKey } = normalizeUsername(submission.username);
  const score = validateScore(submission.score);
  const existing = await db.prepare(EXISTING_SQL).bind(usernameKey).first();
  const improved = !existing || score > existing.score;
  if (improved) {
    await db.batch([
      db.prepare(UPSERT_SQL).bind(usernameKey, username, score),
      db.prepare(PRUNE_SQL),
    ]);
  }
  const entries = await getTopTen(db);
  const rank = entries.find(entry => entry.username.toLowerCase() === usernameKey && entry.score === score)?.rank ?? null;
  return { stored: improved && rank !== null, rank, entries };
}
