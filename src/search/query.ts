import type { Database } from 'better-sqlite3';
import { BM25_WEIGHTS } from './weights';

const W = BM25_WEIGHTS;

export interface SearchHit {
  session_id: string;
  project: string;
  started_at: number | null;
  last_msg_at: number | null;
  msg_count: number;
  first_user_prompt: string | null;
  best_msg_index: number;
  best_ts: number | null;
  snippet: string;
  score: number;              // more negative = more relevant (FTS5 convention)
  cwd: string | null;
}

/**
 * Full-text search with BM25 field weights. Returns one hit per SESSION
 * (the best-ranked message in that session + session metadata).
 */
export function searchSessions(db: Database, query: string, limit: number = 10): SearchHit[] {
  // Per-message ranking with weighted BM25. UNINDEXED columns still count as
  // columns for bm25(); pass 0 for them so their ordinal position matches.
  const perMessage = db.prepare(`
    SELECT
      session_id,
      msg_index AS best_msg_index,
      ts AS best_ts,
      bm25(messages_fts, 0, 0, 0, ?, ?, ?, ?) AS score,
      snippet(messages_fts, -1, '[', ']', '…', 20) AS snippet
    FROM messages_fts
    WHERE messages_fts MATCH ?
    ORDER BY score ASC
    LIMIT ?
  `).all(
    W.user_text, W.assistant_text, W.tool_calls, W.file_paths,
    query, limit * 4,
  ) as Array<{
    session_id: string;
    best_msg_index: number;
    best_ts: number;
    score: number;
    snippet: string;
  }>;

  // Collapse to best match per session, preserving BM25 order.
  const seen = new Map<string, typeof perMessage[number]>();
  for (const row of perMessage) {
    if (!seen.has(row.session_id)) seen.set(row.session_id, row);
    if (seen.size >= limit) break;
  }

  const ids = [...seen.keys()];
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  const meta = db.prepare(`
    SELECT session_id, project, cwd, started_at, last_msg_at, msg_count, first_user_prompt
    FROM sessions WHERE session_id IN (${placeholders})
  `).all(...ids) as Array<{
    session_id: string; project: string; cwd: string | null;
    started_at: number | null; last_msg_at: number | null;
    msg_count: number; first_user_prompt: string | null;
  }>;
  const metaById = new Map(meta.map(m => [m.session_id, m]));

  const hits: SearchHit[] = [];
  for (const [sid, row] of seen) {
    const m = metaById.get(sid);
    if (!m) continue;
    hits.push({
      session_id: sid,
      project: m.project,
      started_at: m.started_at,
      last_msg_at: m.last_msg_at,
      msg_count: m.msg_count,
      first_user_prompt: m.first_user_prompt,
      best_msg_index: row.best_msg_index,
      best_ts: row.best_ts || null,
      snippet: row.snippet,
      score: row.score,
      cwd: m.cwd,
    });
  }
  return hits;
}

export interface WindowMessage {
  msg_index: number;
  ts: number | null;
  role: 'user' | 'assistant';
  text: string;
  tool_calls: string;
  file_paths: string;
}

const APPROX_CHARS_PER_TOKEN = 4;

/**
 * Fetch a message window from the index, token-capped (NOT message-capped),
 * per Gemini's feedback: one tool result can be 50k tokens so message-count
 * windows can blow context.
 */
export function readWindow(
  db: Database,
  sessionId: string,
  aroundMsgIndex: number,
  maxTokens: number = 2000,
  radius: number = 40,
): WindowMessage[] {
  const rows = db.prepare(`
    SELECT msg_index, ts, user_text, assistant_text, tool_calls, file_paths
    FROM messages_fts
    WHERE session_id = ? AND msg_index BETWEEN ? AND ?
    ORDER BY msg_index ASC
  `).all(
    sessionId,
    Math.max(0, aroundMsgIndex - radius),
    aroundMsgIndex + radius,
  ) as Array<{
    msg_index: number;
    ts: number;
    user_text: string;
    assistant_text: string;
    tool_calls: string;
    file_paths: string;
  }>;

  // Expand outward from the target message until we hit the token budget.
  const target = rows.findIndex(r => r.msg_index >= aroundMsgIndex);
  const start = target < 0 ? 0 : target;
  const out: WindowMessage[] = [];
  let budget = maxTokens * APPROX_CHARS_PER_TOKEN;

  const take = (r: typeof rows[number]) => {
    const role: 'user' | 'assistant' = r.user_text ? 'user' : 'assistant';
    const text = (r.user_text || r.assistant_text).slice(0, budget);
    budget -= text.length + r.tool_calls.length;
    out.push({
      msg_index: r.msg_index,
      ts: r.ts || null,
      role,
      text,
      tool_calls: r.tool_calls,
      file_paths: r.file_paths,
    });
  };

  // center, then alternate outward
  if (rows[start]) take(rows[start]);
  let left = start - 1, right = start + 1;
  while (budget > 0 && (left >= 0 || right < rows.length)) {
    if (right < rows.length) { take(rows[right]); right++; if (budget <= 0) break; }
    if (left >= 0)            { take(rows[left]); left--; }
  }
  out.sort((a, b) => a.msg_index - b.msg_index);
  return out;
}

export function listSessionsByFile(db: Database, filePath: string, limit: number = 20): Array<{
  session_id: string; project: string; last_msg_at: number | null; first_user_prompt: string | null;
}> {
  return db.prepare(`
    SELECT s.session_id, s.project, s.last_msg_at, s.first_user_prompt
    FROM session_files sf
    JOIN sessions s ON s.session_id = sf.session_id
    WHERE sf.file_path = ? OR sf.file_path LIKE ?
    ORDER BY s.last_msg_at DESC
    LIMIT ?
  `).all(filePath, `%${filePath}%`, limit) as Array<{
    session_id: string; project: string; last_msg_at: number | null; first_user_prompt: string | null;
  }>;
}

export function listRecent(db: Database, limit: number = 20): Array<{
  session_id: string; project: string; last_msg_at: number | null; msg_count: number; first_user_prompt: string | null;
}> {
  return db.prepare(`
    SELECT session_id, project, last_msg_at, msg_count, first_user_prompt
    FROM sessions
    ORDER BY last_msg_at DESC NULLS LAST
    LIMIT ?
  `).all(limit) as Array<{
    session_id: string; project: string; last_msg_at: number | null; msg_count: number; first_user_prompt: string | null;
  }>;
}
