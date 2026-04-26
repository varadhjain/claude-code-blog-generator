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

export interface ReflectOptions {
  sinceMs: number;
  untilMs?: number;
  project?: string;
  tone?: Tone;
  dryRun?: boolean;        // build digest, print, skip LLM
  outputDir?: string;
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

  const client = new OpenAIClient();
  // Reflection is long-form (~1500-2500 output tokens) and gpt-5-nano is a
  // reasoning model whose reasoning eats into max_completion_tokens. Give it
  // plenty of headroom or it returns empty.
  const reflection = await client.callText(
    'reflection',
    buildSystemPrompt(tone),
    buildUserPrompt(digestMarkdown),
    { maxTokens: 16000, temperature: 0.4 },
  );

  await fs.mkdir(outputDir, { recursive: true });
  const fname = artifactFilename(opts.sinceMs, opts.untilMs ?? Date.now());
  const artifactPath = path.join(outputDir, fname);
  const body = renderArtifact(reflection, digest, tone);
  await fs.writeFile(artifactPath, body);

  return { artifactPath, digest, markdown: body };
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

function renderArtifact(reflection: string, digest: Digest, tone: Tone): string {
  const sessionList = digest.sessions.map(s => `  - ${s.session_id}  (${s.project})`).join('\n');
  const frontmatter = [
    '---',
    `generated_at: ${new Date().toISOString()}`,
    `window_start: ${new Date(digest.window_start).toISOString()}`,
    `window_end: ${new Date(digest.window_end).toISOString()}`,
    `tone: ${tone}`,
    `share_status: private   # reflections are personal — never auto-shareable`,
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
