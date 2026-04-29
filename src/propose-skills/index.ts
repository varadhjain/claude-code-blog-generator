/**
 * `ccblog propose-skills` orchestrator.
 *
 * digest (reused from reflect) → LLM (JSON proposals) → one .md per proposal
 * at ~/.ccblog/skill-proposals/<date>-<slug>.md
 *
 * Proposals are drafts. The user reviews each file and either copies it to
 * ~/.claude/skills/ (or a project's .claude/skills/) or deletes it. We never
 * auto-install.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { openDb } from '../search/db';
import { OpenAIClient } from '../ai/client';
import { buildDigest, digestToPrompt, type Digest } from '../reflect/digest';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt';

export interface ProposeSkillsOptions {
  sinceMs: number;
  untilMs?: number;
  project?: string;
  outputDir?: string;
  dryRun?: boolean;          // build digest, print, skip LLM
  minCitationSessions?: number;  // default 2 — drop proposals with fewer distinct sids
}

export interface SkillProposal {
  name: string;
  slug: string;
  trigger: string;
  frequency: string;
  citations: string[];
  pattern: string;
  tools_used: string[];
  draft_skill_md: string;
  suggested_dir: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface ProposeSkillsResult {
  proposals: SkillProposal[];
  written: string[];           // absolute paths of files written
  digest: Digest;
  dropped: Array<{ proposal: SkillProposal; reason: string }>;
}

const DEFAULT_OUTPUT_DIR = path.join(process.env.HOME!, '.ccblog', 'skill-proposals');

export async function runProposeSkills(opts: ProposeSkillsOptions): Promise<ProposeSkillsResult> {
  const outputDir = opts.outputDir ?? DEFAULT_OUTPUT_DIR;
  const minSessions = opts.minCitationSessions ?? 2;

  const db = openDb();
  const digest = buildDigest(db, {
    sinceMs: opts.sinceMs,
    untilMs: opts.untilMs,
    project: opts.project,
  });

  const empty: ProposeSkillsResult = { proposals: [], written: [], digest, dropped: [] };
  if (digest.sessions.length === 0) return empty;

  const digestMarkdown = digestToPrompt(digest);

  if (opts.dryRun) {
    process.stdout.write(digestMarkdown + '\n');
    return empty;
  }

  const client = new OpenAIClient();
  // gpt-5-nano reasoning model needs headroom for proposals (~3-6 of them,
  // each with a draft_skill_md body). 12k completion tokens is plenty.
  const raw = await client.callStructured<{ proposals: SkillProposal[] }>(
    'propose-skills',
    SYSTEM_PROMPT,
    buildUserPrompt(digestMarkdown),
    { maxTokens: 12000, temperature: 0.3, responseFormat: 'json_object' },
  );

  const proposals = Array.isArray(raw?.proposals) ? raw.proposals : [];
  const dropped: ProposeSkillsResult['dropped'] = [];

  // Enforce the ≥N-distinct-sessions invariant locally — the LLM sometimes
  // drifts even with explicit rules.
  const accepted: SkillProposal[] = [];
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
    if (!p.slug || !p.draft_skill_md) {
      dropped.push({ proposal: p, reason: 'missing slug or draft_skill_md' });
      continue;
    }
    accepted.push(p);
  }

  await fs.mkdir(outputDir, { recursive: true });
  const datePrefix = new Date().toISOString().slice(0, 10);
  const written: string[] = [];

  for (const p of accepted) {
    const safeSlug = p.slug.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const filename = `${datePrefix}-${safeSlug}.md`;
    const fullPath = path.join(outputDir, filename);
    await fs.writeFile(fullPath, renderProposal(p, digest));
    written.push(fullPath);
  }

  return { proposals: accepted, written, digest, dropped };
}

/**
 * Wraps the LLM-drafted skill body with a review header that captures
 * provenance: which sessions, citations, confidence. Reviewer reads the top,
 * scrolls to the actual skill body below the divider, copies that part if
 * they want to install it.
 */
function renderProposal(p: SkillProposal, digest: Digest): string {
  const windowStart = new Date(digest.window_start).toISOString().slice(0, 10);
  const windowEnd = new Date(digest.window_end).toISOString().slice(0, 10);

  const header = [
    '---',
    `proposal_for: ${p.name}`,
    `slug: ${p.slug}`,
    `confidence: ${p.confidence ?? 'medium'}`,
    `suggested_dir: ${p.suggested_dir ?? '~/.claude/skills/'}`,
    `frequency: ${p.frequency ?? 'unknown'}`,
    `tools_used: ${(p.tools_used ?? []).join(', ')}`,
    `digest_window: ${windowStart} → ${windowEnd}`,
    `digest_sessions: ${digest.total_sessions}`,
    `citations: ${(p.citations ?? []).join(', ')}`,
    `share_status: private   # proposals are personal — never auto-shareable`,
    'status: draft   # change to "accepted" or "rejected" after review',
    '---',
    '',
    `# Proposal: ${p.name}`,
    '',
    `**Trigger:** ${p.trigger ?? '—'}`,
    '',
    `**Pattern observed:** ${p.pattern ?? '—'}`,
    '',
    `**To install:** copy the skill body below the divider into \`${p.suggested_dir ?? '~/.claude/skills/'}${p.slug}.md\`.`,
    '',
    '---',
    '',
    '## Drafted skill (copy below this line)',
    '',
  ].join('\n');

  return header + p.draft_skill_md.trim() + '\n';
}

/** Re-export so the CLI can use the shared parseSince helper. */
export { parseSince } from '../reflect';
