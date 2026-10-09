export async function readRaw(env, key) {
  const row = await env.DB.prepare('SELECT body FROM documents WHERE key = ?').bind(key).first();
  if (!row || row.body == null) return null;
  return row.body;
}

export async function writeRaw(env, key, body) {
  await env.DB.prepare(
    'INSERT INTO documents (key, body) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET body = excluded.body',
  ).bind(key, body).run();
}

export async function readJson(env, key) {
  const raw = await readRaw(env, key);
  if (raw == null) return null;
  return JSON.parse(raw);
}
