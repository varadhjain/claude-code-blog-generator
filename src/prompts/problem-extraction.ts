/**
 * Problem Extraction
 *
 * Identifies ALL problems encountered in the session (not just interesting ones).
 * Tracks the complete problem-solving narrative: symptom → attempts → resolution.
 */

import { OpenAIClient } from '../ai/client';
import { SessionDigest } from '../analyzer/digest-builder';

export interface ProblemAttempt {
  approach: string;
  message_index: number;
  outcome: 'failed' | 'partial' | 'succeeded';
}

export interface Problem {
  title: string;
  description: string;
  message_range: [number, number];
  symptom: string; // What went wrong / how it manifested
  attempts: ProblemAttempt[];
  resolution?: string; // How it was finally solved (if solved)
  time_spent_messages: number;
  learnings: string[]; // What this problem taught
}

export interface ProblemsEncountered {
  problems: Problem[];
  total_debugging_time_messages: number;
  summary: string; // One-line summary of problems faced
}

const SYSTEM_PROMPT = `You are an expert at analyzing software development sessions to identify problems the USER faced.

Your task: Extract 3-5 notable problems the USER encountered during the session.

FOCUS ON THE USER:
- What problems did the USER hit?
- How did the USER try to solve them?
- What did the USER learn?

IMPORTANT: Only 3-5 problems maximum. Focus on the most significant or instructive ones.

WHAT COUNTS AS A PROBLEM:
- **Errors**: Compilation errors, runtime errors, test failures
- **Bugs**: Unexpected behavior, wrong output, broken functionality
- **Blockers**: Missing dependencies, configuration issues, API limitations
- **Confusion**: Misunderstanding requirements, unclear documentation
- **Rework**: Having to redo work, refactor significantly, change approach

PROBLEM INDICATORS:
- Tool result contains "error", "failed", "exception"
- Multiple Edit calls to same file in short span
- User says: "that didn't work", "still broken", "wait that's wrong"
- Phase transitions to "debugging"
- Test failures followed by fixes
- Git commit messages mentioning "fix", "resolve", "correct"

FOR EACH PROBLEM EXTRACT:
1. **What went wrong**: Concrete symptom (error message, wrong output)
2. **Attempts to fix**: What approaches were tried, in order
3. **Outcome of each attempt**: Failed, partial success, or succeeded
4. **Final resolution**: How it was ultimately solved (if solved)
5. **Learnings**: What this problem taught about the code, tools, or approach

EXAMPLES:

✅ GOOD - Complete problem tracking:
{
  "title": "TypeScript compilation error in auth.ts",
  "description": "Property 'token' does not exist on type 'User'",
  "symptom": "TypeScript compiler error preventing build",
  "attempts": [
    {"approach": "Added optional token property with ?:", "message_index": 45, "outcome": "failed"},
    {"approach": "Made token required but got runtime errors", "message_index": 47, "outcome": "failed"},
    {"approach": "Added token with proper type and null check", "message_index": 49, "outcome": "succeeded"}
  ],
  "resolution": "Added token: string | null with proper null checks throughout codebase",
  "learnings": ["Optional properties cascade - need null checks everywhere", "TypeScript strictNullChecks requires explicit handling"]
}

✅ GOOD - Routine but complete:
{
  "title": "Typo in function name",
  "description": "Called getUserData instead of getUserInfo",
  "symptom": "ReferenceError: getUserData is not defined",
  "attempts": [
    {"approach": "Fixed typo in caller", "message_index": 23, "outcome": "succeeded"}
  ],
  "resolution": "Corrected function name to match definition",
  "learnings": ["Always check function names match between definition and call sites"]
}

❌ BAD - Vague:
{
  "title": "Some errors happened",
  "description": "There were problems with the code"
}

❌ BAD - Missing attempts:
{
  "title": "Build failed",
  "symptom": "npm run build returned exit code 1",
  "resolution": "Fixed it"
}

Respond with valid JSON only.`;

export async function extractProblems(
  client: OpenAIClient,
  digest: SessionDigest
): Promise<ProblemsEncountered> {
  const userPrompt = buildUserPrompt(digest);

  const result = await client.callStructured<ProblemsEncountered>(
    'problem-extraction',
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: 8000,
    }
  );

  return result;
}

function buildUserPrompt(digest: SessionDigest): string {
  const parts: string[] = ['Extract ALL problems encountered in this session:\n'];

  parts.push('## SESSION OVERVIEW');
  parts.push(`Goal: "${digest.session_opening.initial_request}"`);
  parts.push(`Duration: ~${digest.session_stats.duration_estimate_minutes} minutes`);
  parts.push(`Total messages: ${digest.session_stats.total_messages}\n`);

  // Tools used (errors often appear in Bash, Edit, Write results)
  parts.push('## TOOLS USED');
  digest.tool_summary.slice(0, 10).forEach((t) => {
    parts.push(`- ${t.tool_name}: ${t.count}x (messages ${t.first_used_at_msg}-${t.last_used_at_msg})`);
  });

  // Files modified (multiple edits suggest debugging)
  if (digest.files_modified.length > 0) {
    parts.push('\n## FILES MODIFIED (Potential Rework)');
    digest.files_modified.slice(0, 15).forEach((f) => {
      const fileName = f.split('/').pop() || f;
      parts.push(`  - ${fileName}`);
    });
  }

  // Decision points (might indicate problems)
  if (digest.decision_points.length > 0) {
    parts.push('\n## DECISION POINTS (Potential Blockers)');
    digest.decision_points.slice(0, 5).forEach((d) => {
      parts.push(`- Message ${d.message_index}: ${d.snippet.slice(0, 100)}`);
    });
  }

  // Phase transitions (look for error indicators)
  if (digest.phase_transitions.length > 0) {
    parts.push('\n## PHASE TRANSITIONS');
    digest.phase_transitions.forEach((t) => {
      parts.push(`- Message ${t.message_index}: ${t.indicator}`);
    });
  }

  // Request output
  parts.push('\n---\n');
  parts.push('Extract ALL problems in JSON format:');
  parts.push('{');
  parts.push('  "summary": "one-line summary of problems faced",');
  parts.push('  "total_debugging_time_messages": <estimated messages spent debugging>,');
  parts.push('  "problems": [');
  parts.push('    {');
  parts.push('      "title": "short problem title",');
  parts.push('      "description": "what the problem was",');
  parts.push('      "message_range": [start, end],');
  parts.push('      "symptom": "how the problem manifested (error message, wrong output, etc.)",');
  parts.push('      "attempts": [');
  parts.push('        {');
  parts.push('          "approach": "what was tried",');
  parts.push('          "message_index": <message number>,');
  parts.push('          "outcome": "failed|partial|succeeded"');
  parts.push('        }');
  parts.push('      ],');
  parts.push('      "resolution": "how it was ultimately solved (if solved)",');
  parts.push('      "time_spent_messages": <number of messages>,');
  parts.push('      "learnings": ["what this problem taught"]');
  parts.push('    }');
  parts.push('  ]');
  parts.push('}');

  return parts.join('\n');
}
