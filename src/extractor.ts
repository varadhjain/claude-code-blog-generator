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
import { OpenAIClient } from './ai/client';
import { redactContent } from './redactor';

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

  // Retrieval metadata
  importance: number;
  times_retrieved: number;
  times_useful: number;
  created_at: string;
  updated_at: string;
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

  for (let i = 0; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i]);
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

        // Also capture tool results (errors are high signal)
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

      if (!text.trim()) continue;

      // Detect signals
      const lowerText = text.toLowerCase();
      const hasError = /error|exception|traceback|failed|ENOTFOUND|ECONNREFUSED|exit code [1-9]|❌/i.test(text);
      const hasToolFailure = /tool_result.*error|command failed|exit code [1-9]/i.test(text);
      const isCorrection = role === 'user' && /\b(no|not that|don't|stop|wrong|instead|actually|try|rather)\b/i.test(text) && text.length < 500;
      const isPivot = role === 'assistant' && /\b(different approach|let me try|instead of|actually,? let's|won't work|alternative)\b/i.test(lowerText);

      messages.push({
        index: i,
        role: role as 'user' | 'assistant',
        content: text.substring(0, 2000), // cap per message
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

function segmentEpisodes(messages: ParsedMessage[]): Episode[] {
  const episodes: Episode[] = [];
  let currentEpisode: ParsedMessage[] = [];
  let currentSignal: Episode['signal'] = 'routine';

  function flushEpisode() {
    if (currentEpisode.length < 2) {
      currentEpisode = [];
      currentSignal = 'routine';
      return;
    }

    const summary = currentEpisode
      .slice(0, 3)
      .map(m => m.content.substring(0, 100))
      .join(' | ');

    episodes.push({
      startIndex: currentEpisode[0].index,
      endIndex: currentEpisode[currentEpisode.length - 1].index,
      messages: currentEpisode,
      signal: currentSignal,
      summary,
    });

    currentEpisode = [];
    currentSignal = 'routine';
  }

  for (const msg of messages) {
    // Detect episode boundaries (high-signal events start new episodes)
    if (msg.hasError || msg.isCorrection || msg.isPivot) {
      // If we already have messages, flush as routine first
      if (currentEpisode.length > 0 && currentSignal === 'routine') {
        flushEpisode();
      }

      // Upgrade signal
      if (msg.hasError || msg.hasToolFailure) {
        currentSignal = currentSignal === 'routine' ? 'error_recovery' : currentSignal;
        if (msg.hasToolFailure) currentSignal = 'tool_failure';
      }
      if (msg.isCorrection) currentSignal = 'user_correction';
      if (msg.isPivot) currentSignal = 'approach_pivot';
    }

    currentEpisode.push(msg);

    // If we've accumulated enough messages after a signal event, flush
    if (currentSignal !== 'routine' && currentEpisode.length >= 6) {
      flushEpisode();
    }

    // Long routine episodes get flushed
    if (currentSignal === 'routine' && currentEpisode.length >= 10) {
      flushEpisode();
    }
  }

  flushEpisode();

  // Only return episodes with learning signal
  return episodes.filter(e => e.signal !== 'routine');
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

async function extractLearning(
  client: OpenAIClient,
  episode: Episode,
  sessionId: string
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
      importance: 1.0,
      times_retrieved: 0,
      times_useful: 0,
      created_at: now,
      updated_at: now,
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

  // Redact before processing (so LLM never sees sensitive content)
  if (options.redact) {
    content = redactContent(content).content;
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

  for (const episode of episodes) {
    log(`   Processing ${episode.signal} episode (${episode.messages.length} msgs)...`);
    const learning = await extractLearning(client, episode, sessionId);
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
