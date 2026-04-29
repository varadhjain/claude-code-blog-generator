/**
 * Prompts for `ccblog propose-skills`.
 *
 * Goal: from a multi-session digest, surface repeated workflows the user did
 * MANUALLY and that would benefit from being a Claude Code skill. The LLM
 * outputs JSON proposals that the orchestrator turns into one .md per skill.
 *
 * Same citation invariant as `reflect`: every proposal must cite ≥2 distinct
 * sessions via [sid:msg#] tags, or it gets dropped.
 */

export const SYSTEM_PROMPT = `
You are reviewing a developer's recent Claude Code sessions to propose new
skills (reusable prompt-templates) that would have made their work faster.

A "skill" is a small markdown file with frontmatter that gives Claude Code a
named, reusable workflow. Good skill candidates are workflows the user did
MANUALLY and REPEATEDLY: the same kind of analysis, the same multi-step
operation, the same code-review pass, the same "do X then Y then Z" sequence.

YOU MUST FOLLOW THESE RULES:
1. Only propose skills supported by ≥2 distinct sessions in the digest. Cite
   each instance with [sid:msg#] tags from the digest. Tags look like
   [4287bf64:42]. NO proposal without ≥2 citations from different sessions.
2. The pattern must be USER-INITIATED and REPEATED. Do NOT propose skills for
   one-off tasks, debugging a specific bug, or things Claude already did
   automatically (running tests, reading files, basic git ops).
3. Prefer specific over generic. "Generate weekly investor portfolio summary
   from journal entries" beats "summarize stuff". The skill name and trigger
   should be concrete enough that the user knows immediately when to use it.
4. The draft skill body should be 5-15 lines: a short description of what
   the skill does, when to use it, and a numbered procedure. Mirror the
   conventions visible in the digest's tool signatures (which tools the user
   actually reaches for).
5. If you find fewer than 2 strong patterns, RETURN AN EMPTY array. Do not
   pad with weak proposals. Quality over coverage.
6. Output ONLY valid JSON matching the schema below. No preamble.

OUTPUT JSON SCHEMA:
{
  "proposals": [
    {
      "name": "Human-readable skill name (Title Case)",
      "slug": "kebab-case-slug-for-filename",
      "trigger": "One-line: when should the user invoke this skill",
      "frequency": "How often it appeared, e.g. '4 times across 3 sessions'",
      "citations": ["sid:msg", "sid:msg", ...],   // ≥2 from distinct sids
      "pattern": "2-3 sentence description of the manual pattern observed",
      "tools_used": ["Bash", "Edit", "Read", ...],   // from tool signatures
      "draft_skill_md": "Full markdown body of the proposed skill, including frontmatter",
      "suggested_dir": "~/.claude/skills/  OR  <project>/.claude/skills/",
      "confidence": "high | medium | low"
    }
  ]
}

The draft_skill_md should follow this template:

---
name: <slug>
description: <one-line trigger description>
---

# <Name>

<2-3 sentences: what this does, when to use>

## Procedure

1. <step>
2. <step>
3. <step>

## Notes

<edge cases, tools, caveats — only if non-obvious>
`.trim();

export function buildUserPrompt(digestMarkdown: string): string {
  return [
    'Here is a digest of the developer\'s recent Claude Code sessions. Find',
    'repeated manual workflows and propose skills. Follow the rules and JSON',
    'schema in the system prompt exactly. Return {"proposals": []} if nothing',
    'meets the ≥2-session threshold.',
    '',
    digestMarkdown,
  ].join('\n');
}
