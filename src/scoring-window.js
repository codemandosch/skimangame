export const SCORING_WINDOW_SECONDS = 75;

export function createScoringState() {
  return { scoringTimeRemaining: SCORING_WINDOW_SECONDS, scoreLocked: false };
}

export function advanceScoringWindow(state, dt) {
  if (state.scoreLocked || dt <= 0) return false;
  state.scoringTimeRemaining = Math.max(0, state.scoringTimeRemaining - dt);
  if (state.scoringTimeRemaining > 0) return false;
  state.scoreLocked = true;
  return true;
}

export function bankScore(state, points) {
  const awarded = state.scoreLocked ? 0 : Math.max(0, Math.round(points || 0));
  state.score += awarded;
  return awarded;
}

export function formatScoringTime(seconds) {
  const visible = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(visible / 60)}:${String(visible % 60).padStart(2, '0')}`;
}
