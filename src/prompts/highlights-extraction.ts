/**
 * Highlights Extraction
 *
 * Extracts 3-5 notable highlights from the session.
 * Merges "what went well" + "interesting moments" into one concise output.
 * Models after interesting-moments.ts format (Wilhelm liked it).
 */

import { OpenAIClient } from '../ai/client';
import { SessionDigest } from '../analyzer/digest-builder';
import { UserIntent } from './user-intent';

export interface Highlight {
  title: string; // Short, punchy title
  what: string; // What happened (1-2 sentences)
  why_notable: string; // Why this matters (1 sentence)
  message_range?: [number, number];
}

export interface Highlights {
  highlights: Highlight[]; // 3-5 max
  one_liner: string; // One-line summary of the session
}

const SYSTEM_PROMPT = `You are an expert at identifying the most notable highlights from coding sessions.

Your task: Extract 3-5 highlights that capture what made this session interesting.

WHAT MAKES A GOOD HIGHLIGHT:
- **Concrete**: Specific outcome or achievement
- **User-focused**: What the USER accomplished (not just AI speed)
- **Notable**: Would make someone say "oh, that's cool!"
- **Varied**: Mix of different types (velocity, technique, outcome, learning)

HIGHLIGHT TYPES:

**Velocity**: Speed and output
- "Built 18 files in 37 minutes"
- "Zero compile errors on first run"
- "Complete feature in single session"

**Technique**: How they worked
- "Docs-first approach prevented scope drift"
- "Used TodoWrite to stay organized"
- "One detailed message → complete solution"

**Outcome**: What they built
- "Production-ready TypeScript project from scratch"
- "Deployed working app by end of session"
- "Created reusable component library"

**Learning**: What they discovered
- "Discovered gpt-5-nano API quirk that saved debugging time"
- "Learned TailwindCSS while building UI"
- "Found pattern for type-safe API calls"

**Struggle-to-success**: Overcame challenges
- "Hit TypeScript errors 5 times, finally solved with generics"
- "Debugged CORS issues across 3 different approaches"

EXAMPLES (Model This Format):

✅ GOOD - Short, punchy, clear:
{
  "title": "Rapid TypeScript scaffold",
  "what": "Created production-ready repo with 18 files (configs, docs, code) in under 40 minutes with zero compile errors.",
  "why_notable": "Shows how Claude Code enables fast project setup without sacrificing quality.",
  "message_range": [1, 50]
}

✅ GOOD - User technique:
{
  "title": "One detailed message did it all",
  "what": "User provided 300-word initial request with acceptance criteria. Claude Code delivered complete solution with no corrections needed.",
  "why_notable": "Demonstrates the power of clear, upfront requirements.",
  "message_range": [1, 5]
}

✅ GOOD - Struggle story:
{
  "title": "Three-attempt debugging journey",
  "what": "Hit CORS errors, tried fetch → axios → custom headers before discovering the real issue was proxy config.",
  "why_notable": "Real debugging process shows how Claude Code helps explore solutions systematically.",
  "message_range": [45, 89]
}

❌ BAD - Too vague:
{
  "title": "Fast development",
  "what": "Things went quickly"
}

❌ BAD - AI-focused instead of user-focused:
{
  "title": "Claude Code was efficient",
  "what": "The AI generated a lot of code"
}

Keep it SHORT and PUNCHY. Model the interesting-moments format.

Respond with valid JSON only.`;

export async function extractHighlights(
  client: OpenAIClient,
  digest: SessionDigest,
  userIntent: UserIntent
): Promise<Highlights> {
  const userPrompt = buildUserPrompt(digest, userIntent);

  const result = await client.callStructured<Highlights>(
    'highlights-extraction',
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: 4000,
    }
  );

  return result;
}

function buildUserPrompt(digest: SessionDigest, userIntent: UserIntent): string {
  const parts: string[] = ['Extract 3-5 notable highlights from this session:\n'];

  parts.push('## USER INTENT');
  parts.push(`Focus: ${userIntent.angle}`);
  if (userIntent.custom_description) {
    parts.push(`Description: ${userIntent.custom_description}`);
  }
  parts.push(`Target audience: ${userIntent.target_audience}\n`);

  parts.push('## SESSION OVERVIEW');
  parts.push(`Goal: "${digest.session_opening.initial_request}"`);
  parts.push(`Duration: ~${digest.session_stats.duration_estimate_minutes} minutes`);
  parts.push(`Messages: ${digest.session_stats.total_messages}\n`);

  parts.push('## TOOLS USED');
  digest.tool_summary.slice(0, 10).forEach((t) => {
    parts.push(`- ${t.tool_name}: ${t.count}x`);
  });
  parts.push('');

  parts.push('## WHAT WAS BUILT');
  parts.push(`Files created: ${digest.files_created.length}`);
  if (digest.files_created.length > 0) {
    digest.files_created.slice(0, 10).forEach((f) => {
      const fileName = f.split('/').pop() || f;
      parts.push(`  - ${fileName}`);
    });
  }
  parts.push('');

  if (digest.phase_transitions.length > 0) {
    parts.push('## KEY MOMENTS');
    digest.phase_transitions.forEach((t) => {
      parts.push(`- Message ${t.message_index}: ${t.indicator}`);
    });
    parts.push('');
  }

  parts.push('---\n');
  parts.push('Extract 3-5 highlights in JSON format:');
  parts.push('{');
  parts.push('  "one_liner": "one-sentence summary of entire session",');
  parts.push('  "highlights": [');
  parts.push('    {');
  parts.push('      "title": "short, punchy title",');
  parts.push('      "what": "what happened (1-2 sentences)",');
  parts.push('      "why_notable": "why this matters (1 sentence)",');
  parts.push('      "message_range": [start, end] // optional');
  parts.push('    }');
  parts.push('  ]');
  parts.push('}');

  return parts.join('\n');
}
