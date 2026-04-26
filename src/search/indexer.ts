import { openSync, readSync, closeSync, statSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { Database } from 'better-sqlite3';

export type Source = 'claude-code' | 'codex';

export const DEFAULT_SESSIONS_ROOT = join(homedir(), '.claude', 'projects');
export const DEFAULT_CODEX_ROOT = join(homedir(), '.codex', 'sessions');

const MAX_TOOL_INPUT_PREVIEW = 200;   // chars of tool input args to index
const CHUNK_BYTES = 1 << 20;           // 1 MiB read chunk

interface ParsedMsg {
  msgIndex: number;
  ts: number | null;
  userText: string;
  assistantText: string;
  toolCalls: string;
  filePaths: string[];
  cwd: string | null;
  // true if this line was user's typed prompt (vs a tool_result echo)
  isHumanPrompt: boolean;
}

export interface SessionSource { filePath: string; source: Source; }

export function walkSessions(root: string = DEFAULT_SESSIONS_ROOT): string[] {
  const out: string[] = [];
  let projects: string[];
  try {
    projects = readdirSync(root, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return out;
  }
  for (const proj of projects) {
    const dir = join(root, proj);
    let files: string[];
    try {
      files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    } catch { continue; }
    for (const f of files) out.push(join(dir, f));
  }
  return out;
}

/**
 * Walks Codex CLI's date-partitioned session tree:
 *   ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
 * Returns absolute file paths.
 */
export function walkCodexSessions(root: string = DEFAULT_CODEX_ROOT): string[] {
  const out: string[] = [];
  const recurse = (dir: string, depth: number) => {
    let entries: import('node:fs').Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }) as import('node:fs').Dirent[]; }
    catch { return; }
    for (const entry of entries) {
      const name = entry.name as string;
      const full = join(dir, name);
      if (entry.isDirectory() && depth < 3) recurse(full, depth + 1);
      else if (entry.isFile() && name.endsWith('.jsonl')) out.push(full);
    }
  };
  recurse(root, 0);
  return out;
}

export function walkAll(): SessionSource[] {
  return [
    ...walkSessions().map((filePath): SessionSource => ({ filePath, source: 'claude-code' })),
    ...walkCodexSessions().map((filePath): SessionSource => ({ filePath, source: 'codex' })),
  ];
}

/**
 * Read from `startOffset` up to the last complete line (last `\n`).
 * Returns the safe chunk + the new offset (which lands on the byte AFTER the last \n).
 * Partial trailing lines are left for the next pass.
 */
function readSafeChunk(filePath: string, startOffset: number): { text: string; newOffset: number } {
  const st = statSync(filePath);
  if (st.size <= startOffset) return { text: '', newOffset: startOffset };

  const fd = openSync(filePath, 'r');
  try {
    const toRead = st.size - startOffset;
    const buf = Buffer.alloc(Math.min(toRead, CHUNK_BYTES * 64)); // cap one pass at 64 MiB
    const n = readSync(fd, buf, 0, buf.length, startOffset);
    const slice = buf.subarray(0, n);
    const lastNl = slice.lastIndexOf(0x0a);
    if (lastNl < 0) return { text: '', newOffset: startOffset }; // no complete line yet
    return {
      text: slice.subarray(0, lastNl + 1).toString('utf8'),
      newOffset: startOffset + lastNl + 1,
    };
  } finally {
    closeSync(fd);
  }
}

function extractTextBlocks(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === 'object' && (block as any).type === 'text') {
      const t = (block as any).text;
      if (typeof t === 'string') parts.push(t);
    }
  }
  return parts.join('\n');
}

function extractToolUses(content: unknown): { calls: string[]; files: string[] } {
  const calls: string[] = [];
  const files: string[] = [];
  if (!Array.isArray(content)) return { calls, files };
  for (const block of content) {
    if (!block || typeof block !== 'object') continue;
    if ((block as any).type !== 'tool_use') continue;
    const name = String((block as any).name ?? '');
    const input = (block as any).input ?? {};
    // Compact, searchable rendering of tool args — NOT the result.
    let preview = '';
    try {
      preview = JSON.stringify(input).slice(0, MAX_TOOL_INPUT_PREVIEW);
    } catch { preview = ''; }
    calls.push(`${name} ${preview}`.trim());
    // File-path extraction for high-precision file search.
    const fp = input.file_path ?? input.path ?? input.notebook_path;
    if (typeof fp === 'string' && fp.length > 0) files.push(fp);
    if (typeof input.pattern === 'string' && (name === 'Glob' || name === 'Grep')) {
      // index the pattern as a file-path signal too
      files.push(input.pattern);
    }
  }
  return { calls, files };
}

function parseLine(line: string, msgIndex: number): ParsedMsg | null {
  let obj: any;
  try { obj = JSON.parse(line); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;

  const ts = obj.timestamp ? Date.parse(obj.timestamp) : null;
  const cwd = typeof obj.cwd === 'string' ? obj.cwd : null;
  const msg = obj.message;
  if (!msg || typeof msg !== 'object') {
    // Could be a summary or meta line — skip.
    return null;
  }

  const role = msg.role;
  const content = msg.content;

  if (role === 'user') {
    // Distinguish human prompts from tool_result echoes.
    const isToolResult = Array.isArray(content) && content.some(
      (b: any) => b && typeof b === 'object' && b.type === 'tool_result',
    );
    if (isToolResult) {
      // Skip tool results entirely — they are what make JSONL huge.
      return null;
    }
    const text = extractTextBlocks(content) || (typeof content === 'string' ? content : '');
    if (!text.trim()) return null;
    return {
      msgIndex,
      ts: ts != null && !Number.isNaN(ts) ? ts : null,
      userText: text,
      assistantText: '',
      toolCalls: '',
      filePaths: [],
      cwd,
      isHumanPrompt: true,
    };
  }

  if (role === 'assistant') {
    const text = extractTextBlocks(content);
    const { calls, files } = extractToolUses(content);
    if (!text && calls.length === 0) return null;
    return {
      msgIndex,
      ts: ts != null && !Number.isNaN(ts) ? ts : null,
      userText: '',
      assistantText: text,
      toolCalls: calls.join('\n'),
      filePaths: files,
      cwd,
      isHumanPrompt: false,
    };
  }

  return null;
}

/**
 * Codex CLI emits an event stream (turn.started, turn.completed, item.*).
 * We collapse those events into the same ParsedMsg shape the Claude Code
 * parser produces so the FTS insert path is shared.
 *
 * Schema is inferred from openai/codex public CLI logs as of 2026-04. If
 * Codex changes its event names, update the switch below.
 */
function parseCodexLine(line: string, msgIndex: number): ParsedMsg | null {
  let obj: any;
  try { obj = JSON.parse(line); } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;

  const ts = typeof obj.timestamp === 'string'
    ? Date.parse(obj.timestamp)
    : (typeof obj.created_at === 'string' ? Date.parse(obj.created_at) : null);
  const safeTs = ts != null && !Number.isNaN(ts) ? ts : null;
  const cwd = typeof obj.cwd === 'string' ? obj.cwd
    : (typeof obj?.turn_context?.cwd === 'string' ? obj.turn_context.cwd : null);

  const eventType: string = obj.type || obj.event || '';
  const role: string | undefined = obj.role || obj?.payload?.role;
  const text: string = obj.text || obj.content || obj?.payload?.text || obj?.payload?.message || '';

  // User prompts: either explicit role:'user' or specific event names.
  if (role === 'user' || eventType === 'user_input' || eventType === 'turn.started') {
    const t = typeof text === 'string' ? text.trim() : '';
    if (!t) return null;
    return {
      msgIndex, ts: safeTs,
      userText: t, assistantText: '', toolCalls: '', filePaths: [],
      cwd, isHumanPrompt: true,
    };
  }

  // Assistant turns + their tool invocations.
  if (role === 'assistant' || eventType === 'turn.completed' || eventType.startsWith('item.')) {
    const assistantText = typeof text === 'string' ? text : '';
    const calls: string[] = [];
    const files: string[] = [];

    const tool = obj.tool || obj?.payload?.tool || obj?.payload?.tool_call;
    if (tool && typeof tool === 'object') {
      const name = String(tool.name ?? tool.function ?? '');
      let preview = '';
      try { preview = JSON.stringify(tool.input ?? tool.args ?? tool.arguments ?? {}).slice(0, MAX_TOOL_INPUT_PREVIEW); } catch {}
      if (name) calls.push(`${name} ${preview}`.trim());
      const fp = tool?.input?.file_path ?? tool?.input?.path ?? tool?.args?.file_path;
      if (typeof fp === 'string' && fp) files.push(fp);
    }

    if (!assistantText && calls.length === 0) return null;
    return {
      msgIndex, ts: safeTs,
      userText: '', assistantText, toolCalls: calls.join('\n'), filePaths: files,
      cwd, isHumanPrompt: false,
    };
  }

  return null;
}

function sessionIdFromPath(filePath: string): string {
  return basename(filePath, '.jsonl');
}

function projectFromPath(filePath: string, source: Source): string {
  if (source === 'codex') return 'codex';   // date-partitioned dirs aren't useful as project names
  return basename(dirname(filePath));
}

export interface IndexStats {
  filesScanned: number;
  filesChanged: number;
  messagesIndexed: number;
  bytesIngested: number;
}

export function indexAll(db: Database, opts: { sources?: Source[]; root?: string } = {}): IndexStats {
  const sources = opts.sources ?? ['claude-code', 'codex'];
  const items: SessionSource[] = [];
  if (sources.includes('claude-code')) {
    for (const fp of walkSessions(opts.root ?? DEFAULT_SESSIONS_ROOT))
      items.push({ filePath: fp, source: 'claude-code' });
  }
  if (sources.includes('codex')) {
    for (const fp of walkCodexSessions()) items.push({ filePath: fp, source: 'codex' });
  }

  const stats: IndexStats = { filesScanned: items.length, filesChanged: 0, messagesIndexed: 0, bytesIngested: 0 };
  for (const it of items) {
    const r = indexFile(db, it.filePath, it.source);
    if (r.messagesIndexed > 0 || r.bytesIngested > 0) stats.filesChanged++;
    stats.messagesIndexed += r.messagesIndexed;
    stats.bytesIngested += r.bytesIngested;
  }
  return stats;
}

const getCursor = (db: Database) => db.prepare<[string]>(
  'SELECT byte_offset, mtime_ms FROM ingest_cursor WHERE file_path = ?'
);
const upsertCursor = (db: Database) => db.prepare(
  `INSERT INTO ingest_cursor (file_path, byte_offset, mtime_ms) VALUES (?, ?, ?)
   ON CONFLICT(file_path) DO UPDATE SET byte_offset = excluded.byte_offset, mtime_ms = excluded.mtime_ms`
);
const upsertSession = (db: Database) => db.prepare(
  `INSERT INTO sessions (session_id, file_path, project, cwd, started_at, last_msg_at, msg_count, first_user_prompt, source)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(session_id) DO UPDATE SET
     cwd = COALESCE(sessions.cwd, excluded.cwd),
     started_at = COALESCE(sessions.started_at, excluded.started_at),
     last_msg_at = MAX(COALESCE(sessions.last_msg_at, 0), COALESCE(excluded.last_msg_at, 0)),
     msg_count = sessions.msg_count + excluded.msg_count,
     first_user_prompt = COALESCE(sessions.first_user_prompt, excluded.first_user_prompt),
     source = excluded.source`
);
const insertFts = (db: Database) => db.prepare(
  `INSERT INTO messages_fts (session_id, msg_index, ts, source, user_text, assistant_text, tool_calls, file_paths)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertSessionFile = (db: Database) => db.prepare(
  `INSERT OR IGNORE INTO session_files (session_id, file_path) VALUES (?, ?)`
);
const getCurrentMsgCount = (db: Database) => db.prepare<[string]>(
  'SELECT msg_count FROM sessions WHERE session_id = ?'
);

export function indexFile(db: Database, filePath: string, source: Source = 'claude-code'): { messagesIndexed: number; bytesIngested: number } {
  const st = statSync(filePath);
  const cursor = getCursor(db).get(filePath) as { byte_offset: number; mtime_ms: number } | undefined;
  const startOffset = cursor?.byte_offset ?? 0;

  if (st.size < startOffset) {
    // File was truncated or replaced — restart from 0.
    return reindexFromScratch(db, filePath, source);
  }
  if (st.size === startOffset) {
    return { messagesIndexed: 0, bytesIngested: 0 };
  }

  const { text, newOffset } = readSafeChunk(filePath, startOffset);
  if (!text) return { messagesIndexed: 0, bytesIngested: 0 };

  const sessionId = sessionIdFromPath(filePath);
  const project = projectFromPath(filePath, source);
  const existingCount = (getCurrentMsgCount(db).get(sessionId) as { msg_count: number } | undefined)?.msg_count ?? 0;
  const parser = source === 'codex' ? parseCodexLine : parseLine;

  let indexed = 0;
  let firstPrompt: string | null = null;
  let startedAt: number | null = null;
  let lastMsgAt: number | null = null;
  let sessionCwd: string | null = null;
  const fileSet = new Set<string>();

  const txn = db.transaction((lines: string[]) => {
    const fts = insertFts(db);
    const sf = insertSessionFile(db);
    let idx = existingCount;
    for (const line of lines) {
      if (!line.trim()) continue;
      const p = parser(line, idx);
      if (!p) continue;
      idx++;
      indexed++;
      if (p.ts != null) {
        if (startedAt == null || p.ts < startedAt) startedAt = p.ts;
        if (lastMsgAt == null || p.ts > lastMsgAt) lastMsgAt = p.ts;
      }
      if (sessionCwd == null && p.cwd) sessionCwd = p.cwd;
      if (firstPrompt == null && p.isHumanPrompt && existingCount === 0) {
        firstPrompt = p.userText.slice(0, 500);
      }
      fts.run(
        sessionId,
        p.msgIndex,
        p.ts ?? 0,
        source,
        p.userText,
        p.assistantText,
        p.toolCalls,
        p.filePaths.join('\n'),
      );
      for (const fp of p.filePaths) fileSet.add(fp);
    }
    upsertSession(db).run(
      sessionId, filePath, project, sessionCwd,
      startedAt, lastMsgAt, indexed, firstPrompt, source,
    );
    for (const fp of fileSet) sf.run(sessionId, fp);
    upsertCursor(db).run(filePath, newOffset, st.mtimeMs);
  });

  txn(text.split('\n'));
  return { messagesIndexed: indexed, bytesIngested: newOffset - startOffset };
}

function reindexFromScratch(db: Database, filePath: string, source: Source): { messagesIndexed: number; bytesIngested: number } {
  const sessionId = sessionIdFromPath(filePath);
  db.prepare('DELETE FROM messages_fts WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM session_files WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
  db.prepare('DELETE FROM ingest_cursor WHERE file_path = ?').run(filePath);
  return indexFile(db, filePath, source);
}
