import test from 'node:test';
import assert from 'node:assert/strict';
import { getTopTen, submitBestScore } from '../server/leaderboard.js';
import worker from '../server/index.js';

function sorted(rows) {
  return [...rows.values()].sort((a, b) => b.score - a.score || a.achieved_at.localeCompare(b.achieved_at) || a.username_key.localeCompare(b.username_key));
}

function createFakeD1() {
  const rows = new Map();
  let clock = 0;
  const statement = (sql, values = []) => ({
    bind: (...next) => statement(sql, next),
    async first() {
      if (sql.includes('WHERE username_key = ?')) return rows.get(values[0]) ?? null;
      throw new Error(`Unsupported first query: ${sql}`);
    },
    async all() {
      if (!sql.includes('FROM leaderboard_scores')) throw new Error(`Unsupported all query: ${sql}`);
      return { results: sorted(rows).slice(0, 10) };
    },
    async run() {
      if (sql.startsWith('INSERT INTO leaderboard_scores')) {
        const [username_key, username, score] = values;
        const current = rows.get(username_key);
        if (!current || score > current.score) rows.set(username_key, {
          username_key, username, score, achieved_at: String(++clock).padStart(6, '0'),
        });
        return { success: true };
      }
      if (sql.startsWith('DELETE FROM leaderboard_scores')) {
        const keep = new Set(sorted(rows).slice(0, 10).map(row => row.username_key));
        for (const key of rows.keys()) if (!keep.has(key)) rows.delete(key);
        return { success: true };
      }
      throw new Error(`Unsupported run query: ${sql}`);
    },
  });
  return {
    rows,
    prepare: sql => statement(sql),
    batch: statements => Promise.all(statements.map(item => item.run())),
  };
}

function createFakeEnv() {
  const assetRequests = [];
  return {
    DB: createFakeD1(),
    assetRequests,
    ASSETS: {
      async fetch(request) {
        assetRequests.push(request);
        return new Response('asset', { status: 200 });
      },
    },
  };
}

test('one normalized username keeps only its better score', async () => {
  const db = createFakeD1();
  assert.equal((await submitBestScore(db, { username: ' Rider ', score: 900 })).stored, true);
  assert.equal((await submitBestScore(db, { username: 'rider', score: 800 })).stored, false);
  assert.equal((await submitBestScore(db, { username: 'RIDER', score: 1200 })).stored, true);
  assert.deepEqual(await getTopTen(db), [{ rank: 1, username: 'RIDER', score: 1200 }]);
});

test('the repository prunes to ten deterministic entries', async () => {
  const db = createFakeD1();
  for (let index = 0; index < 12; index++) {
    await submitBestScore(db, { username: `Rider ${index}`, score: 1000 - index });
  }
  const entries = await getTopTen(db);
  assert.equal(entries.length, 10);
  assert.deepEqual(entries.map(entry => entry.score), [1000, 999, 998, 997, 996, 995, 994, 993, 992, 991]);
});

test('invalid names and scores are rejected', async () => {
  const db = createFakeD1();
  for (const submission of [
    { username: '<script>', score: 1 },
    { username: 'Rider', score: -1 },
    { username: 'Rider', score: 1.5 },
    { username: 'Rider', score: Number.POSITIVE_INFINITY },
    { username: 'Rider', score: 1_000_000_001 },
  ]) await assert.rejects(() => submitBestScore(db, submission), /Invalid/);
});

test('GET returns the leaderboard and unknown routes use static assets', async () => {
  const env = createFakeEnv();
  const response = await worker.fetch(new Request('https://game.test/api/leaderboard'), env, {});
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.deepEqual(await response.json(), { entries: [] });
  await worker.fetch(new Request('https://game.test/src/main.js'), env, {});
  assert.equal(env.assetRequests.length, 1);
});

test('POST validates JSON and returns the refreshed board', async () => {
  const env = createFakeEnv();
  const response = await worker.fetch(new Request('https://game.test/api/leaderboard', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'Rider', score: 4321 }),
  }), env, {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    stored: true,
    rank: 1,
    entries: [{ rank: 1, username: 'Rider', score: 4321 }],
  });
  const invalid = await worker.fetch(new Request('https://game.test/api/leaderboard', {
    method: 'POST', body: '{bad json', headers: { 'content-type': 'application/json' },
  }), env, {});
  assert.equal(invalid.status, 400);
});
