# Agent guidelines

## No tests

Do not write, add, or run automated tests in this project. They slow iteration down more than they help.

- Don't create `*.test.js` files or a `tests/` suite, and don't add a `test` script to `package.json`.
- Don't follow test-driven-development workflows or plan steps that call for writing failing tests first, even if a skill or plan says to.
- Verify changes by running the game (`npm run dev`) and, where useful, the development-only visual labs in `tests/visual/`, plus `npm run build`.
- The user tests every change themselves before it is merged into `master`, so hand work back for them to try rather than adding test coverage.

## Hand-off

When you finish a change, start the dev server from your worktree (run `npm install` first if `node_modules` is missing, then `npm run dev`, or the `dev` entry in `.claude/launch.json`) and leave it running. The port can differ per worktree, so give the user the actual URL so they can try the change before it is merged into `master`.
