/**
 * `ccblog reflect` orchestrator.
 *
 * digest → LLM → markdown artifact at ~/.ccblog/reflections/YYYY-WW.md
 *
 * Reflections are personal — they catalogue weaknesses + patterns. They live
 * locally only, marked share_status: 'private' in the frontmatter so any
 * future publisher refuses to ship them.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { openDb } from '../search/db';
import { OpenAIClient } from '../ai/client';
import { buildDigest, digestToPrompt, type Digest } from './digest';
import { buildSystemPrompt, buildUserPrompt, type Tone } from './prompt';
import { runChat } from './chat';

export interface ReflectOptions {
  sinceMs: number;
  untilMs?: number;
  project?: string;
  tone?: Tone;
  dryRun?: boolean;        // build digest, print, skip LLM
  outputDir?: string;
  chat?: boolean;          // drop into REPL after generating
  noPrior?: boolean;       // skip the comparative-vs-prior section
}

export interface ReflectResult {
  artifactPath: string | null;   // null on dry-run
  digest: Digest;
  markdown: string | null;       // null on dry-run
}

const DEFAULT_OUTPUT_DIR = path.join(process.env.HOME!, '.ccblog', 'reflections');

export async function runReflect(opts: ReflectOptions): Promise<ReflectResult> {
  const tone: Tone = opts.tone ?? 'honest';
  const outputDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;

  const db = openDb();
  const digest = buildDigest(db, {
    sinceMs: opts.sinceMs,
    untilMs: opts.untilMs,
    project: opts.project,
  });

  if (digest.sessions.length === 0) {
    return { artifactPath: null, digest, markdown: null };
  }

  const digestMarkdown = digestToPrompt(digest);

  if (opts.dryRun) {
    process.stdout.write(digestMarkdown + '\n');
    return { artifactPath: null, digest, markdown: null };
  }

  // Pull the most recent prior reflection for the comparative section.
  // Skip this current run's window so we never compare a reflection to itself
  // (matters when re-running with the same window).
  const prior = opts.noPrior
    ? null
    : await loadMostRecentPrior(outputDir, opts.sinceMs);

  const client = new OpenAIClient();
  // Reflection is long-form (~1500-2500 output tokens) and gpt-5-nano is a
  // reasoning model whose reasoning eats into max_completion_tokens. Give it
  // plenty of headroom or it returns empty.
  const reflection = await client.callText(
    'reflection',
    buildSystemPrompt(tone, !!prior),
    buildUserPrompt(digestMarkdown, prior?.body),
    { maxTokens: 16000, temperature: 0.4 },
  );

  await fs.mkdir(outputDir, { recursive: true });
  const fname = artifactFilename(opts.sinceMs, opts.untilMs ?? Date.now());
  const artifactPath = path.join(outputDir, fname);
  const body = renderArtifact(reflection, digest, tone, prior?.filename ?? null);
  await fs.writeFile(artifactPath, body);

  // Phase 2 chat REPL — same digest + reflection as context.
  if (opts.chat) {
    const transcript = await runChat(client, {
      digestMarkdown,
      reflection,
      tone,
      priorReflection: prior?.body,
    });
    if (transcript) {
      const updated = body + '\n\n## Discussion\n\n' + transcript + '\n';
      await fs.writeFile(artifactPath, updated);
    }
  }

  return { artifactPath, digest, markdown: body };
}

interface PriorReflection { filename: string; body: string; sinceMs: number; }

/**
 * Find the most recent reflection artifact whose window ENDED before this
 * run's window starts. This preserves linearity — comparing only against
 * truly-prior periods, not overlapping ones.
 */
async function loadMostRecentPrior(outputDir: string, currentSinceMs: number): Promise<PriorReflection | null> {
  let entries: string[];
  try { entries = await fs.readdir(outputDir); }
  catch { return null; }

  const candidates: PriorReflection[] = [];
  for (const f of entries) {
    if (!f.endsWith('.md')) continue;
    const full = path.join(outputDir, f);
    let body: string;
    try { body = await fs.readFile(full, 'utf-8'); } catch { continue; }
    const m = body.match(/^window_end:\s*(\S+)/m);
    if (!m) continue;
    const endMs = Date.parse(m[1]);
    if (Number.isNaN(endMs) || endMs >= currentSinceMs) continue;
    candidates.push({ filename: f, body, sinceMs: endMs });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.sinceMs - a.sinceMs);
  return candidates[0];
}

function artifactFilename(sinceMs: number, untilMs: number): string {
  const end = new Date(untilMs);
  const { year, week } = isoWeek(end);
  const startStr = new Date(sinceMs).toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  return `${year}-W${String(week).padStart(2, '0')}_${startStr}_to_${endStr}.md`;
}

// ISO 8601 week-number — what humans mean by "week 17 of 2026".
function isoWeek(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { year: date.getUTCFullYear(), week };
}

function renderArtifact(reflection: string, digest: Digest, tone: Tone, priorFilename: string | null): string {
  const sessionList = digest.sessions.map(s => `  - ${s.session_id}  (${s.project})`).join('\n');
  const frontmatter = [
    '---',
    `generated_at: ${new Date().toISOString()}`,
    `window_start: ${new Date(digest.window_start).toISOString()}`,
    `window_end: ${new Date(digest.window_end).toISOString()}`,
    `tone: ${tone}`,
    `share_status: private   # reflections are personal — never auto-shareable`,
    priorFilename ? `compared_against: ${priorFilename}` : `compared_against: null`,
    `sessions_analyzed:`,
    sessionList,
    '---',
    '',
  ].join('\n');

  return frontmatter + reflection.trim() + '\n';
}

/** Parse human-friendly window strings like "7d", "14d", "2w" into milliseconds. */
export function parseSince(s: string): number {
  const m = s.match(/^(\d+)\s*(d|day|days|w|week|weeks|h|hour|hours)?$/i);
  if (!m) throw new Error(`Bad --since value: ${s}. Try "7d" or "2w".`);
  const n = parseInt(m[1], 10);
  const unit = (m[2] ?? 'd').toLowerCase();
  const ms =
    unit.startsWith('w') ? n * 7 * 86400_000 :
    unit.startsWith('h') ? n * 3600_000 :
    n * 86400_000;
  return Date.now() - ms;
}
