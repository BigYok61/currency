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

export async function listSubscriptions(env) {
  const res = await env.DB.prepare(
    'SELECT id, topic, config, state, updated_at FROM subscriptions',
  ).all();
  return res.results || [];
}

export async function getSubscription(env, id) {
  return env.DB.prepare(
    'SELECT id, topic, config, state, updated_at FROM subscriptions WHERE id = ?',
  ).bind(id).first();
}

export async function insertSubscription(env, id, topic, config, updatedAt) {
  await env.DB.prepare(
    'INSERT INTO subscriptions (id, topic, config, state, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(id, topic, config, '{"date":"","sent":{}}', updatedAt).run();
}

export async function updateSubscription(env, id, config, updatedAt) {
  await env.DB.prepare(
    'UPDATE subscriptions SET config = ?, updated_at = ? WHERE id = ?',
  ).bind(config, updatedAt, id).run();
}

export async function saveSubscriptionState(env, id, state) {
  await env.DB.prepare('UPDATE subscriptions SET state = ? WHERE id = ?').bind(state, id).run();
}

export async function deleteSubscription(env, id) {
  const res = await env.DB.prepare('DELETE FROM subscriptions WHERE id = ?').bind(id).run();
  return res.meta?.changes || 0;
}

export async function pruneSubscriptions(env, cutoff) {
  const res = await env.DB.prepare('DELETE FROM subscriptions WHERE updated_at < ?').bind(cutoff).run();
  return res.meta?.changes || 0;
}

export async function pruneRateLimits(env, now) {
  await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at <= ?').bind(now).run();
}

/** Zählt einen Treffer im Fenster. Abgelaufene Fenster starten bei 1. */
export async function bumpLimit(env, bucket, now, resetAt) {
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (bucket, hits, reset_at) VALUES (?, 1, ?)
     ON CONFLICT(bucket) DO UPDATE SET
       hits = CASE WHEN rate_limits.reset_at <= ? THEN 1 ELSE rate_limits.hits + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at <= ? THEN excluded.reset_at ELSE rate_limits.reset_at END
     RETURNING hits`,
  ).bind(bucket, resetAt, now, now).first();
  return row ? row.hits : 1;
}
