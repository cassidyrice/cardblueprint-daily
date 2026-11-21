-- Card Blueprint Daily: accounts and storage (Cloudflare D1 / SQLite)

CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  pass_hash   TEXT NOT NULL,
  pass_salt   TEXT NOT NULL,
  name        TEXT NOT NULL,
  birthdate   TEXT NOT NULL,           -- YYYY-MM-DD
  created_at  TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,        -- SHA-256 of the cookie token; the token itself is never stored
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  INTEGER NOT NULL         -- unix seconds
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE people (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  birthdate   TEXT NOT NULL,
  relation    TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL
);
CREATE INDEX people_user ON people(user_id);

CREATE TABLE messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,           -- the user's local date when it was sent
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX messages_user_day ON messages(user_id, day, id);

-- One row per user per day: how many questions they have asked (daily cap).
CREATE TABLE usage (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day         TEXT NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- Sign-in / sign-up throttling, keyed by "login:<email>" or "ip:<address>" per time window.
CREATE TABLE auth_attempts (
  key         TEXT NOT NULL,
  window      INTEGER NOT NULL,
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window)
);
