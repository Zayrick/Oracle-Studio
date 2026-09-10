-- Account-owned OpenRouter credentials. Plaintext keys never enter D1.
ALTER TABLE "pendingRegistration" ADD COLUMN "completionId" TEXT;
ALTER TABLE "pendingRegistration" ADD COLUMN "completionExpiresAt" INTEGER;

CREATE TABLE user_ai_credentials (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  key_hash TEXT UNIQUE,
  encrypted_key TEXT,
  workspace_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  provisioning_id TEXT,
  provisioning_expires_at INTEGER,
  CHECK ((key_hash IS NULL) = (encrypted_key IS NULL))
);
