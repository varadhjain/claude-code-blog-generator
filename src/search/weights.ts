/**
 * BM25 field weights for session search.
 *
 * FTS5's bm25() function takes per-column multipliers: higher weight = matches
 * in that column rank higher. These four numbers decide every search result
 * this tool will ever return — tune them to how YOU search.
 *
 *   user_text      — the human prompts you typed
 *   assistant_text — Claude's text responses
 *   tool_calls     — tool names + compact args (e.g. "Grep auth middleware")
 *   file_paths     — file paths touched by Read/Edit/Write/Glob in the session
 *
 * Trade-offs:
 *   - Heavy user_text        → recalls "the session where I ASKED about X".
 *                              Great if you remember your wording.
 *   - Heavy assistant_text   → recalls explanations, decisions, code Claude wrote.
 *                              Risk: Claude is verbose; common words flatten ranking.
 *   - Heavy file_paths       → "every session that touched auth/middleware.ts" is a
 *                              killer query. Low ambiguity, high precision.
 *   - Heavy tool_calls       → useful for "sessions where I Grep'd for X" but noisy.
 *
 * FTS5 default is 1.0 per column. Typical useful range: 0.5 – 10.0.
 *
 * Re-run `css search <query>` after changing — no reindex needed.
 */
export const BM25_WEIGHTS = {
  user_text:      8.0,  // favor your own wording
  assistant_text: 3.0,  // secondary — Claude is verbose
  tool_calls:     1.5,  // noisy, but useful signal
  file_paths:     7.0,  // high-precision file queries
} as const;

// BM25 saturation + length-norm knobs. FTS5 exposes these via rank config.
// Leave as-is unless you see long sessions dominating results (raise `b`) or
// keyword-stuffing winning (lower `k1`).
export const BM25_TUNING = {
  k1: 1.2,  // term-frequency saturation (default 1.2)
  b:  0.75, // length normalization (default 0.75)
} as const;
