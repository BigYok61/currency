-- Ein Abo je Gerät. id ist das Geheimnis, topic das ntfy-Thema (wae-…).
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  config TEXT NOT NULL,
  state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
