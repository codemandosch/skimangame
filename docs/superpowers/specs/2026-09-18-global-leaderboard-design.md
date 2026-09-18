# Global Top-Ten Leaderboard Design

## Goal

Add a global high-score leaderboard to Mad Steez while preventing players from extending runs indefinitely by skating uphill. Each run lasts at most 60 seconds. Only scores that currently qualify for the global top ten prompt for a username, and each username keeps only its single best score.

## Scope

The feature includes:

- A visible 60-second run timer.
- Automatic run completion when the timer reaches zero.
- A global top-ten leaderboard backed by the Site's D1 database.
- A username prompt only for qualifying runs.
- One best score per case-insensitive username.
- Leaderboard display on the finish screen.
- Graceful behavior when the leaderboard service is unavailable.

This version deliberately uses lightweight client-side score submission. It is suitable for a friends leaderboard but is not intended to resist a determined attacker who fabricates API requests.

## Run Timing

The countdown starts when the skier leaves the summit/start state and the run becomes active. It counts only active simulation time: pausing freezes the timer, and restarting clears it back to 60 seconds.

The HUD displays the remaining time as `0:60` through `0:00`. When the remaining time reaches zero, the game marks the run finished immediately, stops accepting gameplay input, and opens the normal finish flow with the score accumulated at that moment. Reaching the existing mountain finish before zero continues to end the run normally.

The time limit is a gameplay rule enforced in the browser, matching the chosen lightweight approach.

## Leaderboard Data Model

The D1 database contains one `leaderboard_scores` table:

- `username_key`: normalized lowercase username, primary key.
- `username`: trimmed display username.
- `score`: non-negative integer.
- `achieved_at`: server-generated timestamp used as the deterministic tie-breaker.

Usernames are 1-16 characters after trimming. Allowed characters are letters, digits, spaces, underscore, and hyphen. Comparisons are case-insensitive, so `Rider`, `rider`, and `RIDER` refer to one player.

Ranking sorts by score descending, then `achieved_at` ascending, then `username_key` ascending. A score tied with the current tenth-place score does not qualify unless it improves an existing username already in the top ten. This keeps the board at exactly ten deterministic entries.

## Server API

The static-only deployment becomes a Cloudflare Worker-compatible Site with a D1 binding named `DB`. The Worker serves the built game assets and two same-origin endpoints:

### `GET /api/leaderboard`

Returns the ranked top ten as JSON. Each entry contains rank, display username, and score. Responses disable caching so the finish flow evaluates against current data.

### `POST /api/leaderboard`

Accepts `{ username, score }` as JSON. The server validates the username and requires a finite, non-negative integer score within a conservative maximum bound. In one database transaction it:

1. Inserts the username when absent.
2. Replaces the existing score only when the submitted score is higher.
3. Deletes every row outside the ranked top ten.
4. Returns the refreshed top ten plus whether the submitted run was stored and its rank when present.

The server is the final authority on whether a score remains in the top ten. This handles two players submitting around the same time.

## Client Flow and UI

The game loads the leaderboard at startup without blocking play. The finish screen refreshes it before deciding whether to request a username.

A run qualifies for the username prompt when there are fewer than ten entries or its score is strictly greater than the current tenth-place score. The prompt uses an accessible form embedded in the finish panel rather than a browser prompt. It shows the score, a username field, Save and Skip controls, validation feedback, and a short explanation that only a player's best score is retained.

After submission, the finish panel replaces the form with the returned leaderboard and highlights the submitted username when it remains ranked. If the server rejects or displaces the score, the UI explains that the board changed and shows the current top ten. Non-qualifying runs show the leaderboard without asking for a username.

The top ten is also available on the finish screen after ordinary completion or timeout. Existing restart controls continue to work whether loading or submission succeeds or fails.

## Failure Handling

- If the initial leaderboard request fails, gameplay remains available.
- If the finish-time refresh fails, no username is requested because qualification cannot be established reliably; the finish screen shows a compact unavailable message.
- If score submission fails, the typed username remains in the field and the player can retry or skip.
- Invalid usernames are rejected both in the browser and on the server.
- API responses never expose database errors or internal details.

## Project Structure

Client leaderboard behavior and API calls live in focused modules rather than expanding the main game loop:

- A timer module owns countdown state and formatting.
- A leaderboard client module owns API requests, qualification, and username validation shared with UI behavior.
- The main UI module coordinates finish events and renders the leaderboard panel.
- A Worker entrypoint owns static asset serving and API routing.
- Database schema and migration files define the D1 table and indexes.

The hosting manifest adds the logical `DB` D1 binding and removes the static-only declaration that would prevent runtime bindings.

## Testing

Automated tests cover:

- Timer start, pause, restart, natural finish, and timeout behavior.
- Qualification with zero through ten entries and the strict tenth-place boundary.
- Username normalization and validation.
- Server-side insert, best-score-only update, worse-score rejection, deterministic ties, and pruning to ten rows.
- API validation and failure responses.
- Finish-screen behavior for qualifying, non-qualifying, skipped, successful, displaced, and unavailable submissions.

The complete production build must include a callable Worker `fetch` handler, static assets, the hosting manifest, and the D1 migration. Deployment is complete only after the migration and public production deployment succeed.
