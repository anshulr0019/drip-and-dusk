CREATE TABLE auth_flows (
 hash TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN('google','email')), email TEXT,
 verifier TEXT, return_path TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE auth_sessions (
 hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL,
 tokens TEXT NOT NULL, token_expires_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 refresh_lock_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX auth_sessions_user ON auth_sessions(user_id);
ALTER TABLE orders ADD COLUMN customer_user_id TEXT;
CREATE INDEX orders_customer_user ON orders(customer_user_id,created_at);
