const ENDPOINT = '/api/leaderboard';
const USERNAME_PATTERN = /^[A-Za-z0-9 _-]{1,16}$/;

export function validateUsername(value) {
  const username = String(value ?? '').trim();
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, error: 'Use 1-16 letters, numbers, spaces, _ or -.' };
  }
  return { ok: true, username };
}

export function qualifiesForTopTen(score, entries) {
  return entries.length < 10 || score > entries[9].score;
}

async function parseResponse(response) {
  if (!response.ok) throw new Error(`Leaderboard request failed (${response.status})`);
  return response.json();
}

export async function loadLeaderboard(fetchImpl = fetch) {
  const payload = await parseResponse(await fetchImpl(ENDPOINT, { headers: { accept: 'application/json' } }));
  return payload.entries;
}

export async function submitLeaderboardScore(username, score, fetchImpl = fetch) {
  return parseResponse(await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ username, score }),
  }));
}

export function createLeaderboardFlow({ load = loadLeaderboard, submit = submitLeaderboardScore } = {}) {
  const state = {};
  const reset = () => Object.assign(state, {
    phase: 'idle', entries: [], score: 0, rank: null, username: '',
    error: '', promptForUsername: false,
  });
  reset();
  return {
    state,
    reset,
    async evaluate(score) {
      Object.assign(state, { phase: 'loading', score, rank: null, error: '', promptForUsername: false });
      try {
        state.entries = await load();
        state.promptForUsername = qualifiesForTopTen(score, state.entries);
        state.phase = state.promptForUsername ? 'qualifying' : 'leaderboard';
      } catch {
        state.phase = 'unavailable';
        state.entries = [];
        state.error = 'Leaderboard unavailable.';
      }
      return state;
    },
    async save(value) {
      const valid = validateUsername(value);
      state.username = String(value ?? '').trim();
      if (!valid.ok) {
        state.error = valid.error;
        return state;
      }
      state.username = valid.username;
      state.phase = 'saving';
      state.error = '';
      try {
        const result = await submit(valid.username, state.score);
        Object.assign(state, {
          phase: 'leaderboard', entries: result.entries, rank: result.rank,
          promptForUsername: false,
          error: result.stored ? '' : 'That score did not improve your saved result.',
        });
        return state;
      } catch (error) {
        state.phase = 'qualifying';
        state.error = 'Could not save. Try again or skip.';
        throw error;
      }
    },
    skip() {
      state.phase = 'leaderboard';
      state.promptForUsername = false;
      state.error = '';
      return state;
    },
  };
}
