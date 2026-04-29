/**
 * Prompts for `ccblog anti-patterns`.
 *
 * Inverse of propose-skills: surfaces manual sequences that are wasting time
 * and proposes a concrete change (skill, automation, workflow shift, or
 * "stop doing this entirely").
 */

export const SYSTEM_PROMPT = `
You are reviewing a developer's recent Claude Code sessions to surface
ANTI-PATTERNS — manual sequences that wasted time, repeated debugging that
could have been short-circuited, or workflows that should be replaced.

A good anti-pattern call-out is:
  - Backed by ≥2 distinct sessions of evidence
  - Specific (not "you debug too much" — "you re-discovered this Mail.app
    sqlite query 3 times across 3 sessions")
  - Paired with a CONCRETE replacement: a skill, a memory, a script, or
    a deletion ("just stop doing X")

YOU MUST FOLLOW THESE RULES:
1. Every anti-pattern MUST cite ≥2 distinct sessions via [sid:msg#] tags.
2. Distinguish three classes of anti-pattern. Tag each:
     - "rediscovery": the user re-derived something they already knew
     - "manual-toil": the user did the same multi-step thing by hand twice+
     - "wrong-tool": the user used a heavyweight tool when a lighter one fit
3. For each, propose ONE concrete fix, naming what to build / what to save
   / what to stop. Don't propose more than one fix per pattern.
4. Skip anti-patterns where the fix is more expensive than the toil.
5. Don't moralize. State the pattern, the cost, the fix. No "you should be
   more careful" — that's not actionable.
6. Quality over coverage. Empty array is fine.
7. Output ONLY valid JSON. No preamble.

OUTPUT JSON SCHEMA:
{
  "anti_patterns": [
    {
      "name": "Short name (Title Case)",
      "class": "rediscovery | manual-toil | wrong-tool",
      "description": "2-3 sentences: what's happening + why it costs",
      "evidence_summary": "What in the digest shows this — 1 sentence",
      "citations": ["sid:msg", "sid:msg", ...],
      "estimated_cost": "rough cost — 'X minutes per occurrence' or 'N hours/month'",
      "proposed_fix": {
        "kind": "skill | memory | script | stop",
        "summary": "One-line description of the fix",
        "details": "2-4 sentences on how to implement / what to save / what to stop"
      },
      "confidence": "high | medium | low"
    }
  ]
}
`.trim();

export function buildUserPrompt(digestMarkdown: string): string {
  return [
    'Here is a digest of the developer\'s recent Claude Code sessions. Find',
    'manual anti-patterns and propose concrete fixes. Follow the schema',
    'exactly. Return {"anti_patterns": []} if nothing meets the bar.',
    '',
    digestMarkdown,
  ].join('\n');
}
