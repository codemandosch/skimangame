import { defineConfig } from 'vite';

// Each worktree gets its own dev server; the launcher assigns a free port via PORT.
export default defineConfig({
  server: { port: Number(process.env.PORT) || 5173 },
});
