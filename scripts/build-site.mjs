import { build } from 'vite';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });
await build({ build: { outDir: 'dist/client', emptyOutDir: false } });
await build({ build: { ssr: 'server/index.js', outDir: 'dist/server', emptyOutDir: false } });
await mkdir('dist/.openai/drizzle', { recursive: true });
await cp('drizzle/0000_global_leaderboard.sql', 'dist/.openai/drizzle/0000_global_leaderboard.sql');
const hosting = JSON.parse(await readFile('.openai/hosting.json', 'utf8'));
await writeFile('dist/.openai/hosting.json', `${JSON.stringify(hosting, null, 2)}\n`);
