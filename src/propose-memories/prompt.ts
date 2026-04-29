/**
 * Prompts for `ccblog propose-memories`.
 *
 * Memories are durable facts about the user / their work / their preferences
 * that should persist across Claude Code conversations. They live in
 * `~/.claude/projects/<project>/memory/` as `<type>_<topic>.md` files indexed
 * by `MEMORY.md`.
 *
 * Types (mirrors the auto-memory system):
 *   - feedback: rules from corrections OR confirmations (lead with rule, then
 *               Why: + How to apply: lines)
 *   - user:     identity, role, expertise, ways of working
 *   - project:  ongoing initiatives, deadlines, why-this-matters context
 *   - reference: pointers to external systems (Linear project, dashboard URL)
 *
 * Same citation invariant as propose-skills: every proposal must cite ≥2
 * distinct sessions or be dropped before write.
 */

export const SYSTEM_PROMPT = `
You are reviewing a developer's recent Claude Code sessions to propose new
durable memories — facts that should persist across future conversations.

Memory categories (use the closest match):
  - feedback:  a rule the user gave (correction OR validated approach), with
               WHY they gave it. Format the body as:
                 <rule statement>
                 **Why:** <reason — past incident, strong preference>
                 **How to apply:** <when this rule kicks in>
  - user:      identity, role, expertise, working style
  - project:   ongoing work / deadlines / motivations not derivable from code
  - reference: external system pointers (Linear project, dashboard URL,
               specific channel)

YOU MUST FOLLOW THESE RULES:
1. Every proposal MUST cite ≥2 distinct sessions via [sid:msg#] tags.
   No proposal without ≥2 citations from different session ids.
2. Propose ONLY things that will still be true / useful in 3 months.
   Skip ephemeral state (current task, today's debug session, in-progress
   work). Memory is for durable facts.
3. Skip anything derivable from the codebase (file paths, function names,
   architecture). Memory is for things that AREN'T in the code.
4. For "feedback" memories, capture the WHY. A rule without rationale rots —
   future-you can't judge edge cases. If the digest doesn't show a clear why,
   either find one or skip the proposal.
5. Don't propose memories that duplicate likely-existing ones. If the user
   has clearly internalized a preference (mentioned once, never corrected
   again), it's likely already saved.
6. Quality over coverage. Empty array is fine.
7. Output ONLY valid JSON matching the schema. No preamble.

OUTPUT JSON SCHEMA:
{
  "proposals": [
    {
      "name": "Short memorable name (Title Case)",
      "slug": "kebab_case_with_underscores_for_filename",
      "type": "feedback | user | project | reference",
      "description": "One-line description (used by future Claude to decide relevance)",
      "citations": ["sid:msg", "sid:msg", ...],   // ≥2 distinct sids
      "trigger_pattern": "What in recent sessions tells you this memory is needed",
      "body": "The memory content. For feedback type, format as: rule then **Why:** then **How to apply:**",
      "confidence": "high | medium | low"
    }
  ]
}

Naming convention for slug: <type>_<topic>. Examples:
  - feedback_resend_sender
  - user_role_partner_investor
  - project_briefing_pipeline
  - reference_intel_dashboard
`.trim();

export function buildUserPrompt(digestMarkdown: string): string {
  return [
    'Here is a digest of the developer\'s recent Claude Code sessions. Find',
    'durable memories worth saving. Follow the rules and JSON schema in the',
    'system prompt exactly. Return {"proposals": []} if nothing meets the',
    '≥2-session + lasts-3-months threshold.',
    '',
    digestMarkdown,
  ].join('\n');
}
