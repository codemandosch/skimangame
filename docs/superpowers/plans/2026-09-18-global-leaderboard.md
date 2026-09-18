# Global Top-Ten Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 75-second competitive scoring window and a persistent global top-ten leaderboard that stores one best score per username and prompts only qualifying players.

**Architecture:** Keep gameplay simulation and rendering in the existing Vite client, with a focused scoring-window module controlling when points can be banked. Convert the hosted Site from static-only output to a Cloudflare Worker-compatible build: the Worker serves the built client through `env.ASSETS`, exposes same-origin leaderboard endpoints, and stores the ranked top ten in D1.

**Tech Stack:** JavaScript ES modules, Vite 7, Three.js, Node test runner, Cloudflare Worker runtime, Cloudflare D1/SQLite, OpenAI Sites hosting.

**Spec:** `docs/superpowers/specs/2026-09-18-global-leaderboard-design.md`

## Global Constraints

- The competitive scoring window is exactly 75 seconds of active simulation time and pauses with the game.
- Gameplay continues after `0:00`; only additional score banking is disabled.
- The leaderboard contains at most ten rows and one case-insensitive best score per username.
- Username input is requested only when fewer than ten entries exist or the final score strictly exceeds tenth place.
- Usernames are 1-16 trimmed ASCII letters, digits, spaces, underscores, or hyphens.
- Score submission is intentionally lightweight and client-authored; do not add replay verification or authentication.
- The existing public Site and its access mode must be preserved.
- Do not add a new client or server dependency unless an existing platform API cannot satisfy the task.

---

## File Structure

- Create `src/scoring-window.js`: scoring-window constants, mutation helpers, and countdown formatting.
- Create `tests/scoring-window.test.js`: isolated scoring-window and formatting tests.
- Modify `src/physics.js`: initialize the scoring state, advance it, and route landed points through the score lock.
- Create `src/leaderboard-client.js`: qualification, username validation, and same-origin API client.
- Create `tests/leaderboard-client.test.js`: qualification boundary, validation, fetch success, and fetch failure tests.
- Create `server/leaderboard.js`: server validation, ranking queries, best-score upsert, and top-ten pruning.
- Create `server/index.js`: Worker request routing, JSON responses, and static asset fallback.
- Create `tests/leaderboard-server.test.js`: endpoint and repository tests using a deterministic in-memory D1 test double.
- Create `drizzle/0000_global_leaderboard.sql`: D1 schema and ranking index.
- Create `scripts/build-site.mjs`: client/Worker build orchestration and hosting-artifact staging.
- Modify `package.json`: run the Sites-compatible client and server build.
- Modify `.openai/hosting.json`: declare the logical `DB` D1 binding and server-backed static directory.
- Modify `index.html`: scoring timer, score-lock label, username form, leaderboard status, and top-ten list.
- Modify `src/style.css`: responsive HUD and finish-panel leaderboard styling.
- Modify `src/main.js`: timer rendering, finish qualification flow, form submission, retry/skip behavior, and leaderboard rendering.

---

### Task 1: Competitive Scoring Window

**Files:**
- Create: `src/scoring-window.js`
- Create: `tests/scoring-window.test.js`
- Modify: `src/physics.js:52-115, 213-229, 340-355`
- Test: `tests/physics.test.js`

**Interfaces:**
- Produces: `SCORING_WINDOW_SECONDS`, `createScoringState()`, `advanceScoringWindow(state, dt)`, `bankScore(state, points)`, and `formatScoringTime(seconds)`.
- State fields: `scoringTimeRemaining: number`, `scoreLocked: boolean`, and the existing `score: number`.
- Consumers: `src/physics.js` and `src/main.js`.

- [ ] **Step 1: Write failing unit tests for the 75-second clock**

```js
// tests/scoring-window.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCORING_WINDOW_SECONDS,
  createScoringState,
  advanceScoringWindow,
  bankScore,
  formatScoringTime,
} from '../src/scoring-window.js';

test('the scoring window starts at 75 seconds and locks at zero', () => {
  const state = { score: 400, ...createScoringState() };
  assert.equal(SCORING_WINDOW_SECONDS, 75);
  advanceScoringWindow(state, 74.5);
  assert.equal(state.scoreLocked, false);
  advanceScoringWindow(state, 0.5);
  assert.equal(state.scoringTimeRemaining, 0);
  assert.equal(state.scoreLocked, true);
  assert.equal(bankScore(state, 200), 0);
  assert.equal(state.score, 400);
});

test('bankScore awards points before expiry and formatting is countdown-safe', () => {
  const state = { score: 0, ...createScoringState() };
  assert.equal(bankScore(state, 250), 250);
  assert.equal(state.score, 250);
  assert.equal(formatScoringTime(75), '1:15');
  assert.equal(formatScoringTime(0.1), '0:01');
  assert.equal(formatScoringTime(0), '0:00');
});
```

- [ ] **Step 2: Run the new test and verify it fails because the module is absent**

Run: `node --test tests/scoring-window.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/scoring-window.js`.

- [ ] **Step 3: Implement the scoring-window module**

```js
// src/scoring-window.js
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
```

- [ ] **Step 4: Integrate the clock and score lock into physics**

Import the helpers into `src/physics.js`. Spread `createScoringState()` into `createState()`. In `step`, call `advanceScoringWindow(s, dt)` immediately after `s.time += dt`, so pre-start and paused frames never consume the window. In `resolveLanding`, replace direct score addition with:

```js
const points = trick.points || (s.airtime > 0.7 ? 100 : 0);
const awarded = bankScore(s, points);
s.lastTrick = trick.name;
s.lastPoints = awarded;
if (s.airtime > 0.5 || s.trickChain) {
  s.message = s.scoreLocked ? 'SCORE LOCKED' : awarded ? `+${awarded.toLocaleString()}` : 'CLEAN LANDING';
  s.messageDetail = trick.name;
  s.messageTimer = 2.4;
}
```

- [ ] **Step 5: Add physics regression tests for pause, reset, and post-expiry landings**

Add tests to `tests/physics.test.js` that advance an active state to 74 seconds, verify pause prevents countdown, cross 75 seconds, land a valid 100-point air, and assert `finished === false`, `scoreLocked === true`, and score unchanged. Respawn and assert the remaining time returns to 75.

- [ ] **Step 6: Run focused tests**

Run: `node --test tests/scoring-window.test.js tests/physics.test.js`

Expected: PASS for every scoring-window assertion. Record unrelated pre-existing failures separately rather than weakening the new assertions.

- [ ] **Step 7: Commit the scoring-window slice**

```bash
git add src/scoring-window.js src/physics.js tests/scoring-window.test.js tests/physics.test.js
git commit -m "feat: add timed competitive scoring window"
```

---

### Task 2: Client Leaderboard Rules and API

**Files:**
- Create: `src/leaderboard-client.js`
- Create: `tests/leaderboard-client.test.js`

**Interfaces:**
- Produces: `validateUsername(value)`, `qualifiesForTopTen(score, entries)`, `loadLeaderboard(fetchImpl = fetch)`, and `submitLeaderboardScore(username, score, fetchImpl = fetch)`.
- Leaderboard entry shape: `{ rank: number, username: string, score: number }`.
- Consumers: `src/main.js` and Task 5 UI tests.

- [ ] **Step 1: Write failing tests for strict qualification and username rules**

```js
// tests/leaderboard-client.test.js
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
  await assert.rejects(() => loadLeaderboard(async () => ({ ok: false, status: 503 })), /503/);
});
```

- [ ] **Step 2: Run the new test and verify the missing-module failure**

Run: `node --test tests/leaderboard-client.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement validation, qualification, and API helpers**

Implement `validateUsername` with `^[A-Za-z0-9 _-]{1,16}$`, strict tenth-place comparison, a shared response parser that throws `Leaderboard request failed (<status>)`, and JSON POST headers/body. Never render server-returned usernames through `innerHTML`.

- [ ] **Step 4: Run the focused client tests**

Run: `node --test tests/leaderboard-client.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the client rules**

```bash
git add src/leaderboard-client.js tests/leaderboard-client.test.js
git commit -m "feat: add leaderboard client rules"
```

---

### Task 3: D1 Schema and Leaderboard Repository

**Files:**
- Create: `drizzle/0000_global_leaderboard.sql`
- Create: `server/leaderboard.js`
- Create: `tests/leaderboard-server.test.js`

**Interfaces:**
- Produces: `normalizeUsername(value)`, `validateScore(value)`, `getTopTen(db)`, and `submitBestScore(db, { username, score })`.
- D1 contract: `db.prepare(sql).bind(...values).first()`, `.all()`, `.run()`, and `db.batch(statements)`.
- Consumers: `server/index.js`.

- [ ] **Step 1: Add the D1 migration**

```sql
-- drizzle/0000_global_leaderboard.sql
CREATE TABLE IF NOT EXISTS leaderboard_scores (
  username_key TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  achieved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS leaderboard_rank_idx
ON leaderboard_scores (score DESC, achieved_at ASC, username_key ASC);
```

- [ ] **Step 2: Write failing repository tests with a small D1 test double**

Create an in-memory test double that stores rows in a `Map`, recognizes only the repository's exact select/upsert/prune statements, and implements the D1 methods listed above. Test:

```js
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
```

Also test invalid usernames, fractional scores, negative scores, non-finite values, scores above `1_000_000_000`, and ties ordered by timestamp then normalized username.

- [ ] **Step 3: Run repository tests and verify the missing-module failure**

Run: `node --test tests/leaderboard-server.test.js`

Expected: FAIL because `server/leaderboard.js` does not exist.

- [ ] **Step 4: Implement the repository with bound SQL**

Use a case-insensitive key from `username.trim().toLowerCase()`. Query the existing row before writing. If the submitted score is not higher, return `{ stored: false, rank, entries }` without changing the display spelling or timestamp. For improvements, batch this upsert and prune statement:

```sql
INSERT INTO leaderboard_scores (username_key, username, score, achieved_at)
VALUES (?, ?, ?, CURRENT_TIMESTAMP)
ON CONFLICT(username_key) DO UPDATE SET
  username = excluded.username,
  score = excluded.score,
  achieved_at = CURRENT_TIMESTAMP
WHERE excluded.score > leaderboard_scores.score;
```

```sql
DELETE FROM leaderboard_scores
WHERE username_key NOT IN (
  SELECT username_key FROM leaderboard_scores
  ORDER BY score DESC, achieved_at ASC, username_key ASC
  LIMIT 10
);
```

Map query results to sequential one-based ranks and return only rank, username, and score.

- [ ] **Step 5: Run repository tests**

Run: `node --test tests/leaderboard-server.test.js`

Expected: PASS.

- [ ] **Step 6: Commit schema and repository**

```bash
git add drizzle/0000_global_leaderboard.sql server/leaderboard.js tests/leaderboard-server.test.js
git commit -m "feat: add D1 leaderboard repository"
```

---

### Task 4: Worker API and Sites-Compatible Build

**Files:**
- Create: `server/index.js`
- Create: `scripts/build-site.mjs`
- Modify: `tests/leaderboard-server.test.js`
- Modify: `package.json`
- Modify: `.openai/hosting.json`

**Interfaces:**
- Worker export: `export default { async fetch(request, env, ctx) }`.
- Runtime bindings: `env.DB` for D1 and `env.ASSETS` for static assets.
- Routes: `GET /api/leaderboard`, `POST /api/leaderboard`, `OPTIONS /api/leaderboard`; every other request delegates to `env.ASSETS.fetch(request)`.
- Build outputs: `dist/client/**`, `dist/server/index.js`, `dist/.openai/hosting.json`, and `dist/.openai/drizzle/0000_global_leaderboard.sql`.

- [ ] **Step 1: Add failing Worker route tests**

Extend `tests/leaderboard-server.test.js` with a fake `env` and calls to `worker.fetch`:

```js
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
});
```

- [ ] **Step 2: Run the Worker tests and verify they fail**

Run: `node --test tests/leaderboard-server.test.js`

Expected: FAIL because `server/index.js` does not exist.

- [ ] **Step 3: Implement the Worker entrypoint**

Return JSON with `content-type: application/json; charset=utf-8` and `cache-control: no-store`. Return `400` for malformed JSON/validation, `405` for unsupported API methods, and `503` with `{ error: 'Leaderboard unavailable' }` for database failures. Do not include exception messages in public responses. Delegate non-API requests exactly through `env.ASSETS.fetch(request)`.

- [ ] **Step 4: Add the server-backed source hosting manifest**

```json
{
  "project_id": "appgprj_6aad367f9b8c819185c8a51ead52c34e",
  "static": { "directory": "dist/client" },
  "d1": "DB"
}
```

- [ ] **Step 5: Implement deterministic build orchestration**

`scripts/build-site.mjs` must remove only the project-local `dist` directory, run Vite's programmatic `build` twice, and copy deployment metadata:

```js
import { build } from 'vite';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await rm(new URL('../dist', import.meta.url), { recursive: true, force: true });
await build({ build: { outDir: 'dist/client', emptyOutDir: false } });
await build({ build: { ssr: 'server/index.js', outDir: 'dist/server', emptyOutDir: false } });
await mkdir('dist/.openai/drizzle', { recursive: true });
await cp(
  'drizzle/0000_global_leaderboard.sql',
  'dist/.openai/drizzle/0000_global_leaderboard.sql',
);
const hosting = JSON.parse(await readFile('.openai/hosting.json', 'utf8'));
await writeFile('dist/.openai/hosting.json', `${JSON.stringify(hosting, null, 2)}\n`);
```

Change `package.json` build to `node scripts/build-site.mjs`.

- [ ] **Step 6: Run Worker tests and production build**

Run: `node --test tests/leaderboard-server.test.js && npm run build`

Expected: tests PASS; build exits 0; the four required output paths exist. Confirm `dist/server/index.js` exports a default object with a callable `fetch` property by importing it in a one-line Node command.

- [ ] **Step 7: Commit Worker and build support**

```bash
git add server/index.js scripts/build-site.mjs tests/leaderboard-server.test.js package.json .openai/hosting.json
git commit -m "feat: add leaderboard Worker API"
```

---

### Task 5: Finish-Screen Leaderboard Experience

**Files:**
- Modify: `index.html:25-40, 109-123`
- Modify: `src/style.css:157-180, 520-570, responsive sections`
- Modify: `src/main.js:1-110, 245-305`
- Create: `tests/leaderboard-flow.test.js`

**Interfaces:**
- Consumes: scoring-window helpers from Task 1 and API helpers from Task 2.
- Produces: `createLeaderboardFlow({ load, submit })` in `src/leaderboard-client.js`, exposing `evaluate(score)`, `save(username)`, `skip()`, `reset()`, and serializable state for UI rendering.
- DOM IDs: `score-timer`, `score-lock-status`, `leaderboard-status`, `leaderboard-list`, `leaderboard-form`, `leaderboard-username`, `leaderboard-error`, `leaderboard-save`, and `leaderboard-skip`.

- [ ] **Step 1: Write failing flow-controller tests**

```js
// tests/leaderboard-flow.test.js
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
  await flow.save('Rider');
  assert.equal(flow.state.rank, 1);
});
```

- [ ] **Step 2: Run flow tests and verify the missing-export failure**

Run: `node --test tests/leaderboard-flow.test.js`

Expected: FAIL because `createLeaderboardFlow` is not exported.

- [ ] **Step 3: Implement the flow controller**

Keep network state outside `main.js`. The controller phases are `idle`, `loading`, `qualifying`, `saving`, `leaderboard`, and `unavailable`. `evaluate(score)` always refreshes first; on refresh failure it enters `unavailable` without prompting. `save` validates and retains the username on request failure. `skip` shows the loaded entries without submission. `reset` clears per-run state.

- [ ] **Step 4: Add semantic timer, form, status, and ordered-list markup**

Place the scoring timer in the existing `.run-time` HUD. Inside the finish panel, add a form with a real `<label>`, `maxlength="16"`, `autocomplete="nickname"`, and Save/Skip buttons. Add an `<ol>` for the top ten with an `aria-live="polite"` status region. Keep `ONE MORE RUN` available throughout the flow.

- [ ] **Step 5: Integrate timer and finish flow into `src/main.js`**

On every UI refresh:

```js
$('score-timer').textContent = formatScoringTime(state.scoringTimeRemaining);
$('score-lock-status').classList.toggle('hidden', !state.scoreLocked);
$('score').classList.toggle('locked', state.scoreLocked);
```

When `state.finished && !finishShown`, render the finish shell immediately, then await `flow.evaluate(state.score)` without blocking restart. Render leaderboard rows with `createElement` and `textContent`. Disable Save while saving, restore it on failure, focus the username field only for qualifying runs, and focus `again` for non-qualifying/unavailable runs. Call `flow.reset()` from the existing `reset()` function.

When `state.scoreLocked`, the in-air trick display must show the trick name and `SCORE LOCKED` instead of displaying potential combo points as if they could still be banked.

- [ ] **Step 6: Style desktop and mobile leaderboard states**

Use the existing dark panel, condensed type, accent color, borders, and focus-visible treatment. Keep the ordered list readable at 320 CSS pixels, cap the finish panel height with scrolling, align rank/name/score in three columns, and highlight the returned username/rank without relying on color alone.

- [ ] **Step 7: Run client and build verification**

Run: `node --test tests/scoring-window.test.js tests/leaderboard-client.test.js tests/leaderboard-flow.test.js tests/physics.test.js && npm run build`

Expected: new feature tests PASS and the production build exits 0.

- [ ] **Step 8: Commit the complete client experience**

```bash
git add index.html src/style.css src/main.js src/leaderboard-client.js tests/leaderboard-flow.test.js
git commit -m "feat: add global leaderboard finish flow"
```

---

### Task 6: Full Verification and Public Deployment

**Files:**
- Verify: all files from Tasks 1-5
- Update only if verification exposes a feature-specific defect.

**Interfaces:**
- Consumes: complete client build, Worker API, D1 migration, existing Sites project ID, and current public audience.
- Produces: a terminal successful production deployment at the existing Mad Steez URL.

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test`

Expected: all new timer, leaderboard, server, and flow tests PASS. Compare any other failures with the pre-feature baseline and fix only regressions introduced by this feature.

- [ ] **Step 2: Run a fresh production build and validate artifacts**

Run: `npm run build`

Expected: exit 0. Verify these exact paths:

```text
dist/client/index.html
dist/server/index.js
dist/.openai/hosting.json
dist/.openai/drizzle/0000_global_leaderboard.sql
```

Import `dist/server/index.js` and assert `typeof module.default.fetch === 'function'`.

- [ ] **Step 3: Inspect the deployment diff**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors and no generated `dist` files accidentally staged. Preserve unrelated user changes.

- [ ] **Step 4: Publish through the existing Sites project**

Follow `sites:sites-hosting`: preserve the current public audience, reuse the manifest project ID, push the exact source revision, package the server-backed output and migration, save one new version, and deploy it through the non-private path because the Site is public.

- [ ] **Step 5: Verify the terminal deployment and D1 binding**

Poll the returned deployment ID until `succeeded` or `failed`. On success, confirm the exact production URL returned by Sites. Use the Sites database overview to verify binding `DB` and table `leaderboard_scores` exist; do not insert a fake public score merely for testing.

- [ ] **Step 6: Hand off the updated game**

Open the verified production URL in the existing Site browser tab and report the same public game URL. State any remaining pre-existing test failures separately and do not describe the deployment as fully passing if the full suite still has failures.
