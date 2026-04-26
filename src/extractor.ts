/**
 * Learning Extractor — mines Claude Code sessions for structured learnings.
 *
 * Pipeline: .jsonl → episode segmentation → classification → extraction → Learning records
 *
 * Based on:
 * - ExpeL's contrastive extraction (compare failed vs successful attempts)
 * - CER's selectivity (only extract episodes with learning signal)
 * - Voyager's indexing (retrieve by trigger conditions, not raw code)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { execSync } from 'child_process';
import { OpenAIClient } from './ai/client';
import { redactContent } from './redactor';

// Best-effort author identity. Falls back through git → $USER → 'unknown'.
// Cached because git config is fast but we still call it for every learning.
let cachedAuthor: string | null = null;
export function detectAuthor(): string {
  if (cachedAuthor) return cachedAuthor;
  try {
    const email = execSync('git config user.email', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    if (email) return (cachedAuthor = email);
  } catch { /* not in a repo, no git, etc */ }
  cachedAuthor = process.env.USER || process.env.USERNAME || 'unknown';
  return cachedAuthor;
}

// ============================================================================
// TYPES
// ============================================================================

export interface Learning {
  id: string;
  version: 1;

  // What happened
  problem: string;
  root_cause: string;
  solution: string;
  what_didnt_work?: string[];

  // When is this relevant?
  trigger_conditions: string;
  tags: string[];

  // Classification
  type: 'solution' | 'pitfall' | 'pattern' | 'tool_sequence';

  // Provenance
  source_session: string;
  source_date: string;
  files_touched: string[];
  languages: string[];
  author?: string;          // git config user.email or $USER at extraction time

  // Retrieval metadata
  importance: number;
  times_retrieved: number;
  times_useful: number;
  created_at: string;
  updated_at: string;

  // Outbound-share gate. Local features (search, MCP, blog gen) IGNORE this
  // field — it gates only what may leave this machine. A future publisher
  // MUST refuse to read anything other than 'reviewed'.
  share_status?: 'local' | 'reviewed' | 'private';
  reviewed_at?: string | null;

  // Summary of what the redactor stripped from the source session. We keep
  // counts + categories, NOT the original sensitive content.
  redaction_summary?: { count: number; types: string[] };
}

interface Episode {
  startIndex: number;
  endIndex: number;
  messages: ParsedMessage[];
  signal: 'error_recovery' | 'user_correction' | 'approach_pivot' | 'tool_failure' | 'routine';
  summary: string;
}

interface ParsedMessage {
  index: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  hasError: boolean;
  hasToolFailure: boolean;
  isCorrection: boolean;
  isPivot: boolean;
}

// ============================================================================
// JSONL PARSING
// ============================================================================

function parseJSONL(content: string): ParsedMessage[] {
  const lines = content.trim().split('\n');
  const messages: ParsedMessage[] = [];

  // Track pending tool errors to attach to the next message
  let pendingToolError = '';

  for (let i = 0; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]);

      // Handle top-level tool_result entries (Claude Code stores these as separate JSONL lines)
      if (entry.type === 'tool_result' || (entry.content && !entry.message)) {
        const isError = entry.is_error === true;
        if (isError) {
          const errorContent = typeof entry.content === 'string'
            ? entry.content
            : Array.isArray(entry.content)
              ? entry.content.map((x: any) => x.text || '').join('\n')
              : '';
          if (errorContent) pendingToolError += '\n[TOOL ERROR]: ' + errorContent;
        }
        continue;
      }

      if (!entry.message) continue;

      const role = entry.message.role || entry.type;
      if (role !== 'user' && role !== 'assistant') continue;

      // Extract text content
      let text = '';
      if (typeof entry.message.content === 'string') {
        text = entry.message.content;
      } else if (Array.isArray(entry.message.content)) {
        text = entry.message.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');

        // Capture inline tool results
        const toolResults = entry.message.content
          .filter((c: any) => c.type === 'tool_result')
          .map((c: any) => {
            if (typeof c.content === 'string') return c.content;
            if (Array.isArray(c.content)) return c.content.map((x: any) => x.text || '').join('\n');
            return '';
          })
          .join('\n');

        if (toolResults) text += '\n' + toolResults;
      }

      // Attach any pending tool errors
      if (pendingToolError) {
        text += pendingToolError;
        pendingToolError = '';
      }

      if (!text.trim()) continue;

      // Detect signals
      const lowerText = text.toLowerCase();
      const hasError = /error|exception|traceback|failed|ENOTFOUND|ECONNREFUSED|exit code [1-9]|❌|\[TOOL ERROR\]/i.test(text);
      const hasToolFailure = /\[TOOL ERROR\]|command failed|exit code [1-9]/i.test(text);
      // Require multi-word correction phrases to avoid false positives on "no worries", "try this"
      const isCorrection = role === 'user' && /\b(no,|not that|don't do|stop |that's wrong|instead of|wait,? actually|no —|no -)\b/i.test(text) && text.length < 500;
      const isPivot = role === 'assistant' && /\b(different approach|let me try|instead of|actually,? let's|won't work|alternative)\b/i.test(lowerText);

      messages.push({
        index: i,
        role: role as 'user' | 'assistant',
        content: text.substring(0, 3000), // larger cap — errors/traces need room
        hasError,
        hasToolFailure,
        isCorrection,
        isPivot,
      });
    } catch {
      // skip unparseable lines
    }
  }

  return messages;
}

// ============================================================================
// EPISODE SEGMENTATION
// ============================================================================

/**
 * Anchor-based segmentation: find high-signal "anchor" messages, then extract
 * a window of context around each one. This keeps the lead-up (what was tried)
 * and the resolution (what fixed it) together in one episode.
 */
function segmentEpisodes(messages: ParsedMessage[]): Episode[] {
  const CONTEXT_BEFORE = 4;  // messages before the anchor
  const CONTEXT_AFTER = 15;  // messages after (resolution can take several turns)
  const episodes: Episode[] = [];
  const usedIndices = new Set<number>();

  // Find anchor messages (high-signal events)
  const anchors: Array<{ idx: number; signal: Episode['signal'] }> = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.hasToolFailure) anchors.push({ idx: i, signal: 'tool_failure' });
    else if (msg.hasError) anchors.push({ idx: i, signal: 'error_recovery' });
    else if (msg.isCorrection) anchors.push({ idx: i, signal: 'user_correction' });
    else if (msg.isPivot) anchors.push({ idx: i, signal: 'approach_pivot' });
  }

  // Extract window around each anchor
  for (const anchor of anchors) {
    const start = Math.max(0, anchor.idx - CONTEXT_BEFORE);
    const end = Math.min(messages.length - 1, anchor.idx + CONTEXT_AFTER);

    // Skip if this anchor overlaps significantly with an already-extracted episode
    const windowIndices = [];
    for (let i = start; i <= end; i++) windowIndices.push(i);
    const overlapCount = windowIndices.filter(i => usedIndices.has(i)).length;
    if (overlapCount > windowIndices.length * 0.5) continue;

    const episodeMessages = messages.slice(start, end + 1);
    windowIndices.forEach(i => usedIndices.add(i));

    const summary = episodeMessages
      .slice(0, 3)
      .map(m => m.content.substring(0, 100))
      .join(' | ');

    episodes.push({
      startIndex: episodeMessages[0].index,
      endIndex: episodeMessages[episodeMessages.length - 1].index,
      messages: episodeMessages,
      signal: anchor.signal,
      summary,
    });
  }

  return episodes;
}

// ============================================================================
// LLM EXTRACTION
// ============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are a learning extractor for AI coding sessions. Given an episode from a Claude Code session, extract a structured learning record.

Focus on CONTRASTIVE extraction: what was tried first (and failed) vs what ultimately worked. This is the most valuable signal for future agents hitting similar problems.

Only extract if there's genuine learning signal. If this is just routine work, return {"skip": true}.

Return JSON matching this schema:
{
  "skip": false,
  "problem": "specific problem description including error messages",
  "root_cause": "why it happened",
  "solution": "what fixed it, be specific",
  "what_didnt_work": ["approach 1 that failed", "approach 2 that failed"],
  "trigger_conditions": "when would another agent hit this same problem?",
  "tags": ["relevant", "tags", "for", "search"],
  "type": "solution|pitfall|pattern|tool_sequence",
  "files_touched": ["file/paths/mentioned.ts"],
  "languages": ["typescript"]
}`;

interface LearningContext {
  author: string;
  redaction_summary?: { count: number; types: string[] };
}

async function extractLearning(
  client: OpenAIClient,
  episode: Episode,
  sessionId: string,
  ctx: LearningContext,
): Promise<Learning | null> {
  const episodeText = episode.messages
    .map(m => `[${m.role}${m.hasError ? ' ERROR' : ''}${m.isCorrection ? ' CORRECTION' : ''}${m.isPivot ? ' PIVOT' : ''}]: ${m.content}`)
    .join('\n\n');

  const userPrompt = `Episode type: ${episode.signal}
Messages: ${episode.messages.length}

---
${episodeText}
---

Extract a structured learning from this episode. If it's not worth extracting, return {"skip": true}.`;

  try {
    const result = await client.callStructured<any>(
      'learning-extraction',
      EXTRACTION_SYSTEM_PROMPT,
      userPrompt,
      { maxTokens: 2500 }
    );

    if (result.skip) return null;

    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      version: 1,
      problem: result.problem || '',
      root_cause: result.root_cause || '',
      solution: result.solution || '',
      what_didnt_work: result.what_didnt_work || [],
      trigger_conditions: result.trigger_conditions || '',
      tags: result.tags || [],
      type: result.type || 'solution',
      source_session: sessionId,
      source_date: now.substring(0, 10),
      files_touched: result.files_touched || [],
      languages: result.languages || [],
      author: ctx.author,
      importance: 1.0,
      times_retrieved: 0,
      times_useful: 0,
      created_at: now,
      updated_at: now,
      // New extractions are local-only by default. Outbound publishers
      // must require share_status === 'reviewed'; they MUST refuse 'local'.
      share_status: 'local',
      reviewed_at: null,
      redaction_summary: ctx.redaction_summary,
    };
  } catch (error) {
    // Don't fail the whole pipeline for one episode
    return null;
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export interface ExtractionResult {
  learnings: Learning[];
  episodesFound: number;
  episodesExtracted: number;
  sessionId: string;
}

export async function extractFromSession(
  sessionPath: string,
  options: { redact?: boolean; quiet?: boolean } = {}
): Promise<ExtractionResult> {
  const log = options.quiet ? (..._args: any[]) => {} : console.log;
  const sessionId = path.basename(sessionPath, '.jsonl');

  // Parse
  log('📖 Parsing session...');
  let content = await fs.readFile(sessionPath, 'utf-8');

  // Redact before processing (so LLM never sees sensitive content). Capture
  // counts/types so the review TUI can show what got stripped.
  let redactionSummary: { count: number; types: string[] } | undefined;
  if (options.redact) {
    const r = redactContent(content);
    content = r.content;
    redactionSummary = { count: r.redactionCount, types: r.redactedTypes };
  }

  const messages = parseJSONL(content);
  log(`   ${messages.length} messages parsed`);

  // Segment
  log('🔍 Segmenting episodes...');
  const episodes = segmentEpisodes(messages);
  log(`   ${episodes.length} episodes with learning signal`);

  if (episodes.length === 0) {
    return { learnings: [], episodesFound: 0, episodesExtracted: 0, sessionId };
  }

  // Extract
  log('🧠 Extracting learnings...');
  const client = new OpenAIClient();
  const learnings: Learning[] = [];

  const ctx: LearningContext = {
    author: detectAuthor(),
    redaction_summary: redactionSummary,
  };
  for (const episode of episodes) {
    log(`   Processing ${episode.signal} episode (${episode.messages.length} msgs)...`);
    const learning = await extractLearning(client, episode, sessionId, ctx);
    if (learning) {
      learnings.push(learning);
      log(`   ✅ Extracted: ${learning.problem.substring(0, 80)}`);
    } else {
      log(`   ⏭️  Skipped (no learning signal)`);
    }
  }

  // Save
  const learningsDir = path.join(process.env.HOME!, '.ccblog', 'learnings');
  await fs.mkdir(learningsDir, { recursive: true });

  for (const learning of learnings) {
    const filepath = path.join(learningsDir, `${learning.id}.json`);
    await fs.writeFile(filepath, JSON.stringify(learning, null, 2));
  }

  // Touch the pending-review marker so `ccblog status` (and shell prompts)
  // can show that there are new drafts to triage.
  if (learnings.length > 0) {
    const marker = path.join(process.env.HOME!, '.ccblog', 'pending-review.json');
    let prev: { ids: string[] } = { ids: [] };
    try { prev = JSON.parse(await fs.readFile(marker, 'utf-8')); } catch {}
    const next = { ids: Array.from(new Set([...prev.ids, ...learnings.map(l => l.id)])) };
    await fs.writeFile(marker, JSON.stringify(next, null, 2));
  }

  log(`\n📚 Extracted ${learnings.length} learnings from ${episodes.length} episodes`);
  log(`   Saved to ${learningsDir}/`);

  return {
    learnings,
    episodesFound: episodes.length,
    episodesExtracted: learnings.length,
    sessionId,
  };
}

/**
 * Load all learnings from disk
 */
export async function loadLearnings(): Promise<Learning[]> {
  const learningsDir = path.join(process.env.HOME!, '.ccblog', 'learnings');

  try {
    const files = await fs.readdir(learningsDir);
    const learnings: Learning[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      try {
        const content = await fs.readFile(path.join(learningsDir, file), 'utf-8');
        learnings.push(JSON.parse(content));
      } catch {
        // skip corrupt files
      }
    }

    return learnings.sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  } catch {
    return [];
  }
}

/**
 * Update a learning's metadata (e.g., importance score after feedback)
 */
export async function updateLearning(id: string, updates: Partial<Learning>): Promise<void> {
  const filepath = path.join(process.env.HOME!, '.ccblog', 'learnings', `${id}.json`);
  const content = await fs.readFile(filepath, 'utf-8');
  const learning = JSON.parse(content);
  Object.assign(learning, updates, { updated_at: new Date().toISOString() });
  await fs.writeFile(filepath, JSON.stringify(learning, null, 2));
}
