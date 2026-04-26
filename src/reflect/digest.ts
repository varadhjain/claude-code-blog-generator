/**
 * Builds a compact, citation-tagged digest of all sessions in a date window.
 *
 * The digest is what the reflection LLM sees. Goal: ~3-5k tokens that capture
 * the SHAPE of the user's recent work — what they tried, where they pivoted,
 * what they fought with — without including raw tool_result blobs.
 *
 * Every line that could be cited carries a [session-id:msg#] tag so the
 * reflection prompt can be told to anchor every claim in evidence.
 */

import type { Database } from 'better-sqlite3';

export interface DigestSession {
  session_id: string;
  project: string;
  source: string;
  started_at: number | null;
  last_msg_at: number | null;
  msg_count: number;
  first_user_prompt: string | null;
  user_prompts: Array<{ msg_index: number; ts: number | null; text: string }>;
  assistant_decisions: Array<{ msg_index: number; ts: number | null; text: string }>;
  tool_signature: { totals: Record<string, number>; files_touched: string[] };
}

export interface Digest {
  window_start: number;
  window_end: number;
  total_sessions: number;
  total_messages: number;
  sessions: DigestSession[];
}

interface BuildOptions {
  sinceMs: number;        // unix ms — sessions with last_msg_at >= this
  untilMs?: number;       // optional upper bound (default: now)
  project?: string;       // narrow to one project (substring match on project col)
  maxSessions?: number;   // hard cap to keep token budget bounded
  promptsPerSession?: number;
  decisionsPerSession?: number;
}

/**
 * Pulls a window of sessions from the index, plus their highest-signal
 * user prompts and assistant text. tool_result blobs are NEVER pulled —
 * they're filtered at index time and stay out of the digest.
 */
export function buildDigest(db: Database, opts: BuildOptions): Digest {
  const untilMs = opts.untilMs ?? Date.now();
  const maxSessions = opts.maxSessions ?? 25;
  const promptsPer = opts.promptsPerSession ?? 5;
  const decisionsPer = opts.decisionsPerSession ?? 3;

  // 1) Pick sessions in the window, ordered by recency.
  const sessions = db.prepare(`
    SELECT session_id, project, source, started_at, last_msg_at, msg_count, first_user_prompt
    FROM sessions
    WHERE last_msg_at IS NOT NULL
      AND last_msg_at >= ?
      AND last_msg_at <= ?
      ${opts.project ? 'AND project LIKE ?' : ''}
      AND msg_count >= 3
    ORDER BY last_msg_at DESC
    LIMIT ?
  `).all(
    ...(opts.project
      ? [opts.sinceMs, untilMs, `%${opts.project}%`, maxSessions]
      : [opts.sinceMs, untilMs, maxSessions]),
  ) as Array<{
    session_id: string; project: string; source: string;
    started_at: number | null; last_msg_at: number | null;
    msg_count: number; first_user_prompt: string | null;
  }>;

  if (sessions.length === 0) {
    return { window_start: opts.sinceMs, window_end: untilMs, total_sessions: 0, total_messages: 0, sessions: [] };
  }

  const placeholders = sessions.map(() => '?').join(',');
  const ids = sessions.map(s => s.session_id);

  // 2) Pull a sample of user prompts per session.
  //    Strategy: spread across the session, prefer longer prompts (signal).
  const userPrompts = db.prepare(`
    SELECT session_id, msg_index, ts, user_text
    FROM messages_fts
    WHERE session_id IN (${placeholders})
      AND user_text != ''
      AND length(user_text) > 30
    ORDER BY session_id, length(user_text) DESC
  `).all(...ids) as Array<{ session_id: string; msg_index: number; ts: number; user_text: string }>;

  // 3) Pull assistant "decision" text — moments where the assistant declared
  //    intent or made a choice. Cheap heuristic: text containing decision verbs
  //    or markers, weighted by length.
  const assistantText = db.prepare(`
    SELECT session_id, msg_index, ts, assistant_text
    FROM messages_fts
    WHERE session_id IN (${placeholders})
      AND assistant_text != ''
      AND length(assistant_text) > 80
    ORDER BY session_id, length(assistant_text) DESC
  `).all(...ids) as Array<{ session_id: string; msg_index: number; ts: number; assistant_text: string }>;

  // 4) Tool-call signature per session: which tools, how often, what files.
  const toolRows = db.prepare(`
    SELECT session_id, tool_calls, file_paths
    FROM messages_fts
    WHERE session_id IN (${placeholders})
      AND tool_calls != ''
  `).all(...ids) as Array<{ session_id: string; tool_calls: string; file_paths: string }>;

  // 5) Group + cap.
  const byId = new Map<string, DigestSession>();
  let totalMessages = 0;

  for (const s of sessions) {
    byId.set(s.session_id, {
      session_id: s.session_id,
      project: s.project,
      source: s.source,
      started_at: s.started_at,
      last_msg_at: s.last_msg_at,
      msg_count: s.msg_count,
      first_user_prompt: s.first_user_prompt,
      user_prompts: [],
      assistant_decisions: [],
      tool_signature: { totals: {}, files_touched: [] },
    });
    totalMessages += s.msg_count;
  }

  for (const r of userPrompts) {
    const d = byId.get(r.session_id); if (!d) continue;
    if (d.user_prompts.length >= promptsPer) continue;
    d.user_prompts.push({ msg_index: r.msg_index, ts: r.ts || null, text: trim(r.user_text, 400) });
  }

  const decisionRegex = /\b(let me|i'll|i will|going to|plan|approach|next step|first|then|finally|actually|instead|wait|hmm|i think)\b/i;
  for (const r of assistantText) {
    const d = byId.get(r.session_id); if (!d) continue;
    if (d.assistant_decisions.length >= decisionsPer) continue;
    if (!decisionRegex.test(r.assistant_text)) continue;
    d.assistant_decisions.push({ msg_index: r.msg_index, ts: r.ts || null, text: trim(r.assistant_text, 400) });
  }

  for (const r of toolRows) {
    const d = byId.get(r.session_id); if (!d) continue;
    for (const line of r.tool_calls.split('\n')) {
      const name = line.split(' ')[0];
      if (!name) continue;
      d.tool_signature.totals[name] = (d.tool_signature.totals[name] ?? 0) + 1;
    }
    if (r.file_paths) {
      for (const fp of r.file_paths.split('\n')) if (fp) d.tool_signature.files_touched.push(fp);
    }
  }
  // Dedupe + cap files_touched per session.
  for (const d of byId.values()) {
    d.tool_signature.files_touched = Array.from(new Set(d.tool_signature.files_touched)).slice(0, 15);
  }

  // Order sessions to match the original recency order.
  const ordered = sessions.map(s => byId.get(s.session_id)!).filter(Boolean);

  return {
    window_start: opts.sinceMs,
    window_end: untilMs,
    total_sessions: ordered.length,
    total_messages: totalMessages,
    sessions: ordered,
  };
}

function trim(s: string, maxChars: number): string {
  if (s.length <= maxChars) return s;
  return s.slice(0, maxChars - 1) + '…';
}

/**
 * Render the digest to the markdown form the reflection LLM actually consumes.
 * Tagged with [sid:msg#] so every claim the LLM makes can be cited back.
 */
export function digestToPrompt(d: Digest): string {
  if (d.sessions.length === 0) return '(no sessions in window)';

  const lines: string[] = [];
  const startDate = new Date(d.window_start).toISOString().slice(0, 10);
  const endDate = new Date(d.window_end).toISOString().slice(0, 10);
  lines.push(`# Window: ${startDate} → ${endDate}`);
  lines.push(`Sessions: ${d.total_sessions}    Total messages: ${d.total_messages}`);
  lines.push('');

  for (const s of d.sessions) {
    const date = s.last_msg_at ? new Date(s.last_msg_at).toISOString().slice(0, 16).replace('T', ' ') : '?';
    const sid = s.session_id.slice(0, 8);
    lines.push('---');
    lines.push(`## [${sid}] ${s.project}   (${date}, ${s.msg_count} msgs, source=${s.source})`);
    if (s.first_user_prompt) lines.push(`First prompt: ${trim(s.first_user_prompt, 160)}`);
    lines.push('');

    if (s.user_prompts.length) {
      lines.push(`### Notable user prompts`);
      for (const p of s.user_prompts) {
        lines.push(`- [${sid}:${p.msg_index}] ${trim(p.text.replace(/\s+/g, ' '), 240)}`);
      }
      lines.push('');
    }

    if (s.assistant_decisions.length) {
      lines.push(`### Assistant decisions / pivots`);
      for (const a of s.assistant_decisions) {
        lines.push(`- [${sid}:${a.msg_index}] ${trim(a.text.replace(/\s+/g, ' '), 240)}`);
      }
      lines.push('');
    }

    const tools = Object.entries(s.tool_signature.totals).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (tools.length) {
      lines.push(`### Tool signature: ${tools.map(([n, c]) => `${n}×${c}`).join(', ')}`);
    }
    if (s.tool_signature.files_touched.length) {
      lines.push(`### Files touched: ${s.tool_signature.files_touched.join(', ')}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
