import { getTopTen, submitBestScore } from './leaderboard.js';

const headers = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers });
}

async function leaderboard(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  try {
    if (request.method === 'GET') return json({ entries: await getTopTen(env.DB) });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    let submission;
    try {
      submission = await request.json();
    } catch {
      return json({ error: 'Invalid submission' }, 400);
    }
    try {
      return json(await submitBestScore(env.DB, submission));
    } catch (error) {
      if (/^Invalid /.test(error?.message || '')) return json({ error: error.message }, 400);
      throw error;
    }
  } catch {
    return json({ error: 'Leaderboard unavailable' }, 503);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/leaderboard') return leaderboard(request, env);
    return env.ASSETS.fetch(request);
  },
};
