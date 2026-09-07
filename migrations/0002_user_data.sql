-- Application data uses Unix seconds. Better Auth's dates remain adapter-managed.
CREATE TABLE user_data (
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  record_json TEXT,
  revision TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  PRIMARY KEY (user_id, id),
  CHECK (record_json IS NULL OR json_valid(record_json)),
  CHECK ((deleted_at IS NULL AND record_json IS NOT NULL) OR
         (deleted_at IS NOT NULL AND record_json IS NULL))
);
