import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Co-located with other ccblog state so users have one place to nuke.
export const DEFAULT_DB_PATH = join(homedir(), '.ccblog', 'session-index.db');

export function openDb(path: string = DEFAULT_DB_PATH): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  initSchema(db);
  return db;
}

// Bump when changing the FTS5 column shape. The migration drops + recreates
// messages_fts and clears the ingest_cursor so the next index pass rebuilds it.
const SCHEMA_VERSION = 2;

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      file_path  TEXT NOT NULL UNIQUE,
      project    TEXT NOT NULL,
      cwd        TEXT,
      started_at INTEGER,
      last_msg_at INTEGER,
      msg_count  INTEGER NOT NULL DEFAULT 0,
      first_user_prompt TEXT,
      source     TEXT NOT NULL DEFAULT 'claude-code'
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
    CREATE INDEX IF NOT EXISTS idx_sessions_source ON sessions(source);

    CREATE TABLE IF NOT EXISTS ingest_cursor (
      file_path   TEXT PRIMARY KEY,
      byte_offset INTEGER NOT NULL DEFAULT 0,
      mtime_ms    INTEGER NOT NULL DEFAULT 0
    );

    -- Session-level file-path index for fast "which sessions touched file X" queries.
    CREATE TABLE IF NOT EXISTS session_files (
      session_id TEXT NOT NULL,
      file_path  TEXT NOT NULL,
      PRIMARY KEY (session_id, file_path)
    );
    CREATE INDEX IF NOT EXISTS idx_session_files_path ON session_files(file_path);
  `);

  // Idempotent ALTER for the source column on `sessions` — needed for users
  // upgrading from v1 of the schema. SQLite will throw if the column already
  // exists; we catch and ignore.
  try { db.exec(`ALTER TABLE sessions ADD COLUMN source TEXT NOT NULL DEFAULT 'claude-code'`); } catch {}

  const current = (db.prepare(`SELECT value FROM schema_meta WHERE key = 'version'`).get() as { value: string } | undefined)?.value;
  const currentVersion = current ? parseInt(current, 10) : 1;

  if (currentVersion < SCHEMA_VERSION) {
    // FTS5 cannot ALTER. Drop + recreate with the new column set, then wipe
    // the cursor so the next `ccblog index` pass repopulates from scratch.
    db.exec(`DROP TABLE IF EXISTS messages_fts;`);
    db.exec(`DELETE FROM ingest_cursor;`);
  }

  db.exec(`
    -- One row per message we care about. Message-level granularity lets us
    -- return precise snippets and link back to a specific point in the JSONL.
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      session_id  UNINDEXED,
      msg_index   UNINDEXED,   -- ordinal position in the session
      ts          UNINDEXED,
      source      UNINDEXED,   -- 'claude-code' | 'codex'
      user_text,                -- column 1: weight w_user
      assistant_text,           -- column 2: weight w_assist
      tool_calls,               -- column 3: weight w_tools  (name + compact args, NOT results)
      file_paths,               -- column 4: weight w_files  (from Read/Edit/Write/Glob)
      tokenize = 'porter unicode61'
    );
  `);

  db.prepare(`INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', ?)`).run(String(SCHEMA_VERSION));
}

export interface SessionRow {
  session_id: string;
  file_path: string;
  project: string;
  cwd: string | null;
  started_at: number | null;
  last_msg_at: number | null;
  msg_count: number;
  first_user_prompt: string | null;
}

export interface CursorRow {
  file_path: string;
  byte_offset: number;
  mtime_ms: number;
}
