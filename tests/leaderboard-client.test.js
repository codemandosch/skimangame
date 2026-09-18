import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateUsername,
  qualifiesForTopTen,
  loadLeaderboard,
  submitLeaderboardScore,
} from '../src/leaderboard-client.js';

const ten = Array.from({ length: 10 }, (_, index) => ({
  rank: index + 1,
  username: `Rider ${index + 1}`,
  score: 1000 - index * 50,
}));

test('qualification requires strictly beating tenth place', () => {
  assert.equal(qualifiesForTopTen(1, []), true);
  assert.equal(qualifiesForTopTen(551, ten), true);
  assert.equal(qualifiesForTopTen(550, ten), false);
  assert.equal(qualifiesForTopTen(400, ten), false);
});

test('usernames are trimmed and limited to safe display characters', () => {
  assert.deepEqual(validateUsername('  Ski-Man_7  '), { ok: true, username: 'Ski-Man_7' });
  assert.equal(validateUsername('').ok, false);
  assert.equal(validateUsername('a'.repeat(17)).ok, false);
  assert.equal(validateUsername('<script>').ok, false);
});

test('the API helpers use same-origin endpoints and surface failures', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ entries: ten }) };
  };
  assert.deepEqual(await loadLeaderboard(fetchImpl), ten);
  await submitLeaderboardScore('Rider', 1234, fetchImpl);
  assert.equal(calls[0].url, '/api/leaderboard');
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].options.body), { username: 'Rider', score: 1234 });
  await assert.rejects(() => loadLeaderboard(async () => ({ ok: false, status: 503 })), /503/);
});
