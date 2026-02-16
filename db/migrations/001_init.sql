CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  display_name TEXT,
  avatar_data_url TEXT,
  last_seen_at TEXT,
  active_videos INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  avatar_data_url TEXT,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
