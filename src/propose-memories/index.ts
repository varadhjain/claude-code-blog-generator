/**
 * `ccblog propose-memories` orchestrator.
 *
 * Mirrors propose-skills: digest → LLM → JSON proposals → one .md per write.
 * Drops any proposal lacking ≥N distinct session citations.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { openDb } from '../search/db';
import { OpenAIClient } from '../ai/client';
import { buildDigest, digestToPrompt, type Digest } from '../reflect/digest';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

export type MemoryType = 'feedback' | 'user' | 'project' | 'reference';

export interface MemoryProposal {
  name: string;
  slug: string;
  type: MemoryType;
  description: string;
  citations: string[];
  trigger_pattern: string;
  body: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ProposeMemoriesOptions {
  sinceMs: number;
  untilMs?: number;
  project?: string;
  outputDir?: string;
  dryRun?: boolean;
  minCitationSessions?: number;
  workspaceMode?: boolean;   // tell the LLM to look for cross-project patterns
}

export interface ProposeMemoriesResult {
  proposals: MemoryProposal[];
  written: string[];
  digest: Digest;
  dropped: Array<{ proposal: MemoryProposal; reason: string }>;
}

const DEFAULT_OUTPUT_DIR = path.join(process.env.HOME!, '.ccblog', 'memory-proposals');

export async function runProposeMemories(opts: ProposeMemoriesOptions): Promise<ProposeMemoriesResult> {
  const outputDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;
  const minSessions = opts.minCitationSessions ?? 2;

  const db = openDb();
  const digest = buildDigest(db, {
    sinceMs: opts.sinceMs,
    untilMs: opts.untilMs,
    project: opts.project,
  });

  const empty: ProposeMemoriesResult = { proposals: [], written: [], digest, dropped: [] };
  if (digest.sessions.length === 0) return empty;

  const digestMarkdown = digestToPrompt(digest);

  if (opts.dryRun) {
    process.stdout.write(digestMarkdown + '\n');
    return empty;
  }

  const userPrompt = opts.workspaceMode
    ? buildUserPrompt(digestMarkdown) + '\n\nNOTE: This digest spans MULTIPLE projects. Prefer memories that capture cross-project patterns or workspace-wide preferences over project-local ones.'
    : buildUserPrompt(digestMarkdown);

  const client = new OpenAIClient();
  const raw = await client.callStructured<{ proposals: MemoryProposal[] }>(
    'propose-memories',
    SYSTEM_PROMPT,
    userPrompt,
    { maxTokens: 12000, temperature: 0.3, responseFormat: 'json_object' },
  );

  const proposals = Array.isArray(raw?.proposals) ? raw.proposals : [];
  const dropped: ProposeMemoriesResult['dropped'] = [];
  const accepted: MemoryProposal[] = [];

  for (const p of proposals) {
    const distinctSids = new Set<string>();
    for (const c of p.citations ?? []) {
      const sid = String(c).split(':')[0];
      if (sid) distinctSids.add(sid);
    }
    if (distinctSids.size < minSessions) {
      dropped.push({ proposal: p, reason: `only ${distinctSids.size} distinct session(s), need ≥${minSessions}` });
      continue;
    }
    if (!p.slug || !p.body || !p.type) {
      dropped.push({ proposal: p, reason: 'missing slug/body/type' });
      continue;
    }
    if (!['feedback', 'user', 'project', 'reference'].includes(p.type)) {
      dropped.push({ proposal: p, reason: `invalid type: ${p.type}` });
      continue;
    }
    accepted.push(p);
  }

  await fs.mkdir(outputDir, { recursive: true });
  const datePrefix = new Date().toISOString().slice(0, 10);
  const written: string[] = [];

  for (const p of accepted) {
    const safeSlug = p.slug.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const filename = `${datePrefix}-${safeSlug}.md`;
    await fs.writeFile(path.join(outputDir, filename), renderProposal(p, digest));
    written.push(path.join(outputDir, filename));
  }

  return { proposals: accepted, written, digest, dropped };
}

/**
 * Render a memory proposal. Top section is the review header; section below
 * the divider is the actual memory file content (frontmatter + body) ready
 * to copy into the user's memory dir as `<slug>.md`.
 */
function renderProposal(p: MemoryProposal, digest: Digest): string {
  const windowStart = new Date(digest.window_start).toISOString().slice(0, 10);
  const windowEnd = new Date(digest.window_end).toISOString().slice(0, 10);

  const reviewHeader = [
    '---',
    `proposal_for: ${p.name}`,
    `slug: ${p.slug}`,
    `memory_type: ${p.type}`,
    `confidence: ${p.confidence ?? 'medium'}`,
    `digest_window: ${windowStart} → ${windowEnd}`,
    `digest_sessions: ${digest.total_sessions}`,
    `citations: ${(p.citations ?? []).join(', ')}`,
    `trigger_pattern: ${p.trigger_pattern ?? '—'}`,
    `share_status: private   # memory proposals are personal — never auto-shareable`,
    'status: draft   # change to "accepted" or "rejected" after review',
    '---',
    '',
    `# Proposal: ${p.name}`,
    '',
    `**Type:** ${p.type}`,
    '',
    `**To install:** copy the section below the divider into \`~/.claude/projects/<project>/memory/${p.slug}.md\` and add a one-line index entry to \`MEMORY.md\`.`,
    '',
    '---',
    '',
    '## Memory file (copy below this line)',
    '',
  ].join('\n');

  const memoryFile = [
    '---',
    `name: ${p.name}`,
    `description: ${p.description}`,
    `type: ${p.type}`,
    '---',
    '',
    p.body.trim(),
  ].join('\n');

  return reviewHeader + memoryFile + '\n';
}

export { parseSince } from '../reflect';
