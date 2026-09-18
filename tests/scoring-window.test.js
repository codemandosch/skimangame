import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCORING_WINDOW_SECONDS,
  createScoringState,
  advanceScoringWindow,
  bankScore,
  formatScoringTime,
} from '../src/scoring-window.js';

test('the scoring window locks points at zero without finishing play', () => {
  const state = { score: 400, finished: false, ...createScoringState() };
  assert.equal(SCORING_WINDOW_SECONDS, 75);
  advanceScoringWindow(state, 74.5);
  assert.equal(state.scoreLocked, false);
  advanceScoringWindow(state, 0.5);
  assert.equal(state.scoringTimeRemaining, 0);
  assert.equal(state.scoreLocked, true);
  assert.equal(state.finished, false);
  assert.equal(bankScore(state, 200), 0);
  assert.equal(state.score, 400);
});

test('points bank before expiry and countdown formatting rounds up', () => {
  const state = { score: 0, ...createScoringState() };
  assert.equal(bankScore(state, 250), 250);
  assert.equal(state.score, 250);
  assert.equal(formatScoringTime(75), '1:15');
  assert.equal(formatScoringTime(0.1), '0:01');
  assert.equal(formatScoringTime(0), '0:00');
});
