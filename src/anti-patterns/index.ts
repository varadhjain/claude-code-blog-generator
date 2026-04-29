/**
 * `ccblog anti-patterns` orchestrator.
 *
 * Output: a single .md file at ~/.ccblog/anti-patterns/<date>.md with a
 * ranked list. (Unlike propose-skills which writes one file per proposal,
 * anti-patterns are a digest — easier to scan as one document.)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { openDb } from '../search/db';
import { OpenAIClient } from '../ai/client';
import { buildDigest, digestToPrompt, type Digest } from '../reflect/digest';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

export type AntiPatternClass = 'rediscovery' | 'manual-toil' | 'wrong-tool';
export type FixKind = 'skill' | 'memory' | 'script' | 'stop';

export interface AntiPattern {
  name: string;
  class: AntiPatternClass;
  description: string;
  evidence_summary: string;
  citations: string[];
  estimated_cost: string;
  proposed_fix: {
    kind: FixKind;
    summary: string;
    details: string;
  };
  confidence: 'high' | 'medium' | 'low';
}

export interface AntiPatternsOptions {
  sinceMs: number;
  untilMs?: number;
  project?: string;
  outputDir?: string;
  dryRun?: boolean;
  minCitationSessions?: number;
}

export interface AntiPatternsResult {
  anti_patterns: AntiPattern[];
  artifactPath: string | null;
  digest: Digest;
  dropped: Array<{ pattern: AntiPattern; reason: string }>;
}

const DEFAULT_OUTPUT_DIR = path.join(process.env.HOME!, '.ccblog', 'anti-patterns');

export async function runAntiPatterns(opts: AntiPatternsOptions): Promise<AntiPatternsResult> {
  const outputDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;
  const minSessions = opts.minCitationSessions ?? 2;

  const db = openDb();
  const digest = buildDigest(db, {
    sinceMs: opts.sinceMs,
    untilMs: opts.untilMs,
    project: opts.project,
  });

  const empty: AntiPatternsResult = { anti_patterns: [], artifactPath: null, digest, dropped: [] };
  if (digest.sessions.length === 0) return empty;

  const digestMarkdown = digestToPrompt(digest);

  if (opts.dryRun) {
    process.stdout.write(digestMarkdown + '\n');
    return empty;
  }

  const client = new OpenAIClient();
  const raw = await client.callStructured<{ anti_patterns: AntiPattern[] }>(
    'anti-patterns',
    SYSTEM_PROMPT,
    buildUserPrompt(digestMarkdown),
    { maxTokens: 12000, temperature: 0.3, responseFormat: 'json_object' },
  );

  const candidates = Array.isArray(raw?.anti_patterns) ? raw.anti_patterns : [];
  const dropped: AntiPatternsResult['dropped'] = [];
  const accepted: AntiPattern[] = [];

  for (const p of candidates) {
    const distinctSids = new Set<string>();
    for (const c of p.citations ?? []) {
      const sid = String(c).split(':')[0];
      if (sid) distinctSids.add(sid);
    }
    if (distinctSids.size < minSessions) {
      dropped.push({ pattern: p, reason: `only ${distinctSids.size} distinct session(s)` });
      continue;
    }
    if (!p.name || !p.proposed_fix?.summary) {
      dropped.push({ pattern: p, reason: 'missing name or fix' });
      continue;
    }
    if (!['rediscovery', 'manual-toil', 'wrong-tool'].includes(p.class)) {
      dropped.push({ pattern: p, reason: `invalid class: ${p.class}` });
      continue;
    }
    accepted.push(p);
  }

  if (accepted.length === 0) {
    return { anti_patterns: [], artifactPath: null, digest, dropped };
  }

  await fs.mkdir(outputDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const artifactPath = path.join(outputDir, `${date}.md`);
  await fs.writeFile(artifactPath, renderArtifact(accepted, digest));

  return { anti_patterns: accepted, artifactPath, digest, dropped };
}

function renderArtifact(patterns: AntiPattern[], digest: Digest): string {
  const windowStart = new Date(digest.window_start).toISOString().slice(0, 10);
  const windowEnd = new Date(digest.window_end).toISOString().slice(0, 10);

  const lines: string[] = [
    '---',
    `generated_at: ${new Date().toISOString()}`,
    `window_start: ${new Date(digest.window_start).toISOString()}`,
    `window_end: ${new Date(digest.window_end).toISOString()}`,
    `sessions_analyzed: ${digest.total_sessions}`,
    `share_status: private`,
    '---',
    '',
    `# Anti-patterns: ${windowStart} → ${windowEnd}`,
    '',
    `${patterns.length} pattern(s) found across ${digest.total_sessions} sessions.`,
    '',
  ];

  for (const p of patterns) {
    lines.push('---');
    lines.push('');
    lines.push(`## ${p.name}`);
    lines.push(`*class: ${p.class}* · *confidence: ${p.confidence}* · *cost: ${p.estimated_cost}*`);
    lines.push('');
    lines.push(p.description);
    lines.push('');
    lines.push(`**Evidence:** ${p.evidence_summary}`);
    lines.push(`**Citations:** ${(p.citations ?? []).join(', ')}`);
    lines.push('');
    lines.push(`### Fix (${p.proposed_fix.kind}): ${p.proposed_fix.summary}`);
    lines.push('');
    lines.push(p.proposed_fix.details);
    lines.push('');
  }

  return lines.join('\n');
}

export { parseSince } from '../reflect';
