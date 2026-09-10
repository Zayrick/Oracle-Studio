CREATE TABLE ai_usage_turns (
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  feature TEXT NOT NULL CHECK (feature IN ('bazi', 'liuyao')),
  session_id TEXT NOT NULL,
  history_record_id TEXT,
  message_id INTEGER,
  state TEXT NOT NULL DEFAULT 'running' CHECK (state IN ('running', 'complete', 'stopped', 'error')),
  revision INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ended_at INTEGER,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX ai_usage_turns_session ON ai_usage_turns (user_id, feature, session_id);

CREATE TABLE ai_model_calls (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  parent_call_id TEXT REFERENCES ai_model_calls (id),
  credential_hash TEXT,
  workspace_id TEXT NOT NULL,
  requested_model TEXT NOT NULL,
  model TEXT,
  provider TEXT,
  generation_id TEXT,
  request_json TEXT NOT NULL CHECK (json_valid(request_json)),
  usage_json TEXT CHECK (usage_json IS NULL OR json_valid(usage_json)),
  normalized_json TEXT CHECK (normalized_json IS NULL OR json_valid(normalized_json)),
  cost TEXT,
  usage_status TEXT NOT NULL DEFAULT 'pending' CHECK (usage_status IN ('pending', 'complete', 'unavailable')),
  state TEXT NOT NULL DEFAULT 'running' CHECK (state IN ('running', 'complete', 'stopped', 'error')),
  http_status INTEGER,
  finish_reason TEXT,
  native_finish_reason TEXT,
  created_at INTEGER NOT NULL,
  ended_at INTEGER,
  FOREIGN KEY (user_id, turn_id) REFERENCES ai_usage_turns (user_id, id) ON DELETE CASCADE,
  UNIQUE (user_id, turn_id, sequence)
);
CREATE INDEX ai_model_calls_turn ON ai_model_calls (user_id, turn_id);

CREATE TABLE ai_tool_calls (
  id TEXT PRIMARY KEY NOT NULL,
  model_call_id TEXT NOT NULL REFERENCES ai_model_calls (id) ON DELETE CASCADE,
  tool_call_id TEXT NOT NULL,
  name TEXT NOT NULL,
  arguments TEXT NOT NULL,
  result TEXT,
  state TEXT NOT NULL CHECK (state IN ('running', 'complete', 'error')),
  created_at INTEGER NOT NULL,
  ended_at INTEGER,
  UNIQUE (model_call_id, tool_call_id)
);

CREATE TABLE ai_usage_observations (
  id TEXT PRIMARY KEY NOT NULL,
  model_call_id TEXT NOT NULL REFERENCES ai_model_calls (id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('stream', 'generation')),
  outcome TEXT NOT NULL CHECK (outcome IN ('complete', 'unavailable')),
  http_status INTEGER,
  error_code TEXT,
  payload_json TEXT CHECK (payload_json IS NULL OR json_valid(payload_json)),
  created_at INTEGER NOT NULL
);
CREATE INDEX ai_usage_observations_call ON ai_usage_observations (model_call_id, created_at);
