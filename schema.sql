CREATE TABLE IF NOT EXISTS rate_limits (
  ip TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_ts ON rate_limits(ip, timestamp);

CREATE TABLE IF NOT EXISTS cache (
  url TEXT PRIMARY KEY,
  response TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
