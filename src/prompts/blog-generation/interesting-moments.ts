/**
 * Interesting Moments Detector
 *
 * Finds the 3 most interesting/notable things that happened in a session.
 * Helps users discover what's worth writing about.
 */

import { OpenAIClient } from '../../ai/client';
import { SessionDigest } from '../../analyzer/blog-generation/digest-builder';

export interface InterestingMoment {
  title: string;
  description: string;
  why_interesting: string;
  message_range?: [number, number];
}

export interface InterestingMoments {
  moments: InterestingMoment[];
  summary: string; // One-line summary of the session
}

const SYSTEM_PROMPT = `You are an expert at identifying what makes a coding session interesting and worth sharing.

Your task: Analyze a session and find the 3 most interesting/notable things that happened.

WHAT MAKES SOMETHING INTERESTING:
- **Unusual approaches**: Did something unconventional or creative
- **Big accomplishments**: Built something substantial quickly
- **Clever solutions**: Solved a tricky problem in an elegant way
- **Surprising patterns**: Discovered or demonstrated an interesting workflow
- **Learning moments**: Hit a bug that taught something valuable
- **Speed/efficiency**: Accomplished a lot in little time
- **Novel techniques**: Used tools or methods in creative ways

EXAMPLES OF INTERESTING MOMENTS:
✅ "Built a complete TypeScript project in 37 minutes with zero compile errors"
✅ "Used a docs-first approach - wrote 8 .md files before any code"
✅ "Discovered a bug in gpt-5-nano that required max_completion_tokens instead of max_tokens"
✅ "Created a two-stage analysis pipeline that reduced token costs by 85%"
✅ "Hit an error 3 times, tried different approaches, finally solved with caching"

NOT INTERESTING:
❌ "Created a package.json file" (routine)
❌ "Installed npm dependencies" (standard)
❌ "Fixed a typo" (minor)

Focus on things that would make someone say "oh, that's cool!" or "I didn't know you could do that!"

Respond with valid JSON only.`;

export async function findInterestingMoments(
  client: OpenAIClient,
  digest: SessionDigest
): Promise<InterestingMoments> {
  const userPrompt = buildUserPrompt(digest);

  const result = await client.callStructured<InterestingMoments>(
    'interesting-moments',
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: 8000, // Increased for gpt-5-nano reasoning model
    }
  );

  return result;
}

function buildUserPrompt(digest: SessionDigest): string {
  const parts: string[] = ['Find the 3 most interesting things in this session:\n'];

  // Opening context
  parts.push('## SESSION OVERVIEW');
  parts.push(`Goal: "${digest.session_opening.initial_request}"`);
  parts.push(`Duration: ~${digest.session_stats.duration_estimate_minutes} minutes`);
  parts.push(`Total messages: ${digest.session_stats.total_messages}\n`);

  // Tools used (shows what they did)
  parts.push('## TOOLS USED');
  digest.tool_summary.slice(0, 10).forEach((t) => {
    parts.push(`- ${t.tool_name}: ${t.count}x`);
  });

  // Files (shows what they built)
  if (digest.files_created.length > 0) {
    parts.push('\n## WHAT WAS BUILT');
    parts.push(`Created ${digest.files_created.length} files:`);
    digest.files_created.slice(0, 15).forEach((f) => {
      const fileName = f.split('/').pop() || f;
      parts.push(`  - ${fileName}`);
    });
  }

  // Decision points (shows interesting moments)
  if (digest.decision_points.length > 0) {
    parts.push('\n## KEY MOMENTS');
    digest.decision_points.slice(0, 5).forEach((d) => {
      parts.push(`- Message ${d.message_index}: ${d.snippet.slice(0, 100)}`);
    });
  }

  // Phase transitions (shows workflow)
  if (digest.phase_transitions.length > 0) {
    parts.push('\n## TRANSITIONS');
    digest.phase_transitions.slice(0, 5).forEach((t) => {
      parts.push(`- Message ${t.message_index}: ${t.indicator}`);
    });
  }

  // Request output
  parts.push('\n---\n');
  parts.push('Identify the 3 most interesting things in JSON format:');
  parts.push('{');
  parts.push('  "summary": "one-line summary of the entire session",');
  parts.push('  "moments": [');
  parts.push('    {');
  parts.push('      "title": "short catchy title",');
  parts.push('      "description": "what happened",');
  parts.push('      "why_interesting": "why this is worth sharing",');
  parts.push('      "message_range": [start, end] // optional');
  parts.push('    }');
  parts.push('  ]');
  parts.push('}');

  return parts.join('\n');
}
