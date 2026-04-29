/**
 * `ccblog propose-claude-md` orchestrator.
 *
 * Same shape as propose-skills/propose-memories. Output is a list of
 * proposed CLAUDE.md additions, each as its own .md file with a review
 * header + the markdown block ready to paste.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { openDb } from '../search/db';
import { OpenAIClient } from '../ai/client';
import { buildDigest, digestToPrompt, type Digest } from '../reflect/digest';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

export interface ClaudeMdProposal {
  rule: string;
  why: string;
  section: string;
  citations: string[];
  markdown: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ProposeClaudeMdOptions {
  sinceMs: number;
  untilMs?: number;
  project?: string;
  outputDir?: string;
  dryRun?: boolean;
  minCitationSessions?: number;
}

export interface ProposeClaudeMdResult {
  proposals: ClaudeMdProposal[];
  written: string[];
  digest: Digest;
  dropped: Array<{ proposal: ClaudeMdProposal; reason: string }>;
}

const DEFAULT_OUTPUT_DIR = path.join(process.env.HOME!, '.ccblog', 'claude-md-proposals');

export async function runProposeClaudeMd(opts: ProposeClaudeMdOptions): Promise<ProposeClaudeMdResult> {
  const outputDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;
  const minSessions = opts.minCitationSessions ?? 2;

  const db = openDb();
  const digest = buildDigest(db, {
    sinceMs: opts.sinceMs,
    untilMs: opts.untilMs,
    project: opts.project,
  });

  const empty: ProposeClaudeMdResult = { proposals: [], written: [], digest, dropped: [] };
  if (digest.sessions.length === 0) return empty;

  const digestMarkdown = digestToPrompt(digest);

  if (opts.dryRun) {
    process.stdout.write(digestMarkdown + '\n');
    return empty;
  }

  const client = new OpenAIClient();
  const raw = await client.callStructured<{ proposals: ClaudeMdProposal[] }>(
    'propose-claude-md',
    SYSTEM_PROMPT,
    buildUserPrompt(digestMarkdown),
    { maxTokens: 10000, temperature: 0.3, responseFormat: 'json_object' },
  );

  const proposals = Array.isArray(raw?.proposals) ? raw.proposals : [];
  const dropped: ProposeClaudeMdResult['dropped'] = [];
  const accepted: ClaudeMdProposal[] = [];

  for (const p of proposals) {
    const distinctSids = new Set<string>();
    for (const c of p.citations ?? []) {
      const sid = String(c).split(':')[0];
      if (sid) distinctSids.add(sid);
    }
    if (distinctSids.size < minSessions) {
      dropped.push({ proposal: p, reason: `only ${distinctSids.size} distinct session(s)` });
      continue;
    }
    if (!p.rule || !p.markdown) {
      dropped.push({ proposal: p, reason: 'missing rule or markdown' });
      continue;
    }
    accepted.push(p);
  }

  await fs.mkdir(outputDir, { recursive: true });
  const datePrefix = new Date().toISOString().slice(0, 10);
  const written: string[] = [];

  for (let i = 0; i < accepted.length; i++) {
    const p = accepted[i];
    const slug = slugify(p.rule).slice(0, 60);
    const filename = `${datePrefix}-${String(i + 1).padStart(2, '0')}-${slug || 'rule'}.md`;
    await fs.writeFile(path.join(outputDir, filename), renderProposal(p, digest));
    written.push(path.join(outputDir, filename));
  }

  return { proposals: accepted, written, digest, dropped };
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function renderProposal(p: ClaudeMdProposal, digest: Digest): string {
  const windowStart = new Date(digest.window_start).toISOString().slice(0, 10);
  const windowEnd = new Date(digest.window_end).toISOString().slice(0, 10);

  const header = [
    '---',
    `proposal_type: claude-md-rule`,
    `target_section: ${p.section ?? '(uncategorized)'}`,
    `confidence: ${p.confidence ?? 'medium'}`,
    `digest_window: ${windowStart} → ${windowEnd}`,
    `citations: ${(p.citations ?? []).join(', ')}`,
    `share_status: private`,
    'status: draft   # change to "accepted" or "rejected" after review',
    '---',
    '',
    `# Proposed CLAUDE.md addition`,
    '',
    `**Rule:** ${p.rule}`,
    '',
    `**Why:** ${p.why}`,
    '',
    `**Suggested section:** ${p.section ?? '—'}`,
    '',
    `**To install:** paste the markdown below into the suggested section of your CLAUDE.md.`,
    '',
    '---',
    '',
    '## Markdown to paste',
    '',
  ].join('\n');

  return header + p.markdown.trim() + '\n';
}

export { parseSince } from '../reflect';
