import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeaderboardFlow } from '../src/leaderboard-client.js';

test('non-qualifying runs never request a username', async () => {
  const entries = Array.from({ length: 10 }, (_, i) => ({ rank: i + 1, username: `R${i}`, score: 1000 - i }));
  const flow = createLeaderboardFlow({ load: async () => entries, submit: async () => assert.fail('must not submit') });
  await flow.evaluate(100);
  assert.equal(flow.state.phase, 'leaderboard');
  assert.equal(flow.state.promptForUsername, false);
});

test('qualifying runs prompt, preserve input on failure, and show the saved rank', async () => {
  let attempts = 0;
  const flow = createLeaderboardFlow({
    load: async () => [],
    submit: async username => {
      attempts++;
      if (attempts === 1) throw new Error('offline');
      return { stored: true, rank: 1, entries: [{ rank: 1, username, score: 500 }] };
    },
  });
  await flow.evaluate(500);
  assert.equal(flow.state.promptForUsername, true);
  await assert.rejects(() => flow.save('Rider'));
  assert.equal(flow.state.username, 'Rider');
  assert.equal(flow.state.phase, 'qualifying');
  await flow.save('Rider');
  assert.equal(flow.state.rank, 1);
  assert.equal(flow.state.phase, 'leaderboard');
});

test('a failed refresh never asks for a username', async () => {
  const flow = createLeaderboardFlow({ load: async () => { throw new Error('offline'); }, submit: async () => {} });
  await flow.evaluate(9000);
  assert.equal(flow.state.phase, 'unavailable');
  assert.equal(flow.state.promptForUsername, false);
});
