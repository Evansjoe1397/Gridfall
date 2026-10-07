CREATE TABLE matches (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL,
  source TEXT NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  arena TEXT,
  mode TEXT,
  commit_sha TEXT,
  received_at INTEGER NOT NULL,
  record_json TEXT NOT NULL CHECK(json_valid(record_json))
);
CREATE INDEX matches_date ON matches(ended_at);
CREATE INDEX matches_mode_arena ON matches(mode, arena);
CREATE INDEX matches_source ON matches(source);
CREATE INDEX matches_commit ON matches(commit_sha);
CREATE TABLE participants (
  match_id TEXT NOT NULL REFERENCES matches(id),
  seat TEXT NOT NULL,
  character TEXT NOT NULL,
  character_name TEXT NOT NULL,
  result TEXT NOT NULL,
  metrics_json TEXT NOT NULL CHECK(json_valid(metrics_json)),
  PRIMARY KEY(match_id, seat)
);
CREATE INDEX participants_character ON participants(character, match_id);
