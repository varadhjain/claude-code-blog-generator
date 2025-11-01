/**
 * Success Extraction
 *
 * Identifies what went well in the session (explicit success tracking).
 * Complements interesting-moments by focusing on ALL successes, not just unusual ones.
 */

import { OpenAIClient } from '../../ai/client';
import { SessionDigest } from '../../analyzer/blog-generation/digest-builder';

export interface Success {
  what: string; // What went well
  why_noteworthy: string; // Why this success matters
  message_range: [number, number];
  category: 'velocity' | 'elegance' | 'efficiency' | 'collaboration' | 'quality';
  evidence: string; // Specific proof from the session
}

export interface SuccessesIdentified {
  successes: Success[];
  overall_velocity: 'high' | 'medium' | 'low';
  summary: string; // One-line summary of what went well
}

const SYSTEM_PROMPT = `You are an expert at identifying what went well in software development sessions.

Your task: Extract ALL successes, wins, and positive patterns from the session.

WHAT COUNTS AS SUCCESS:
- **Velocity**: High output in short time, smooth implementation phases
- **Elegance**: Clean abstractions, reusable components, good architecture
- **Efficiency**: No rework needed, tests passed first try, minimal debugging
- **Collaboration**: Effective back-and-forth, clear communication, good planning
- **Quality**: Comprehensive tests, good documentation, robust error handling

DO NOT ONLY FOCUS ON "IMPRESSIVE" WINS:
✅ Include routine successes: "Tests passed on first run"
✅ Include process wins: "Planning phase saved time later"
✅ Include small victories: "Clean function with good naming"
✅ Include avoided problems: "Type system caught bug before runtime"

SUCCESS INDICATORS:
- High Write tool usage without many Edit calls (clean first drafts)
- No errors after test runs
- Documentation created alongside code
- Phases completed quickly (low message count)
- Files created in logical order
- User satisfaction indicators: "perfect", "looks good", "exactly right"
- Reusable patterns established early
- Good abstractions that worked throughout

CATEGORIES:

1. **Velocity**: Speed and momentum
   - "Created 18 files in 37 minutes"
   - "Implemented feature in single phase with no backtracking"
   - "Smooth progression from planning to deployment"

2. **Elegance**: Code quality and design
   - "Clean separation between data layer and business logic"
   - "Reusable utility functions used across 5 components"
   - "Type system design prevented entire class of errors"

3. **Efficiency**: No waste
   - "Zero compile errors after initial implementation"
   - "All tests passed on first run"
   - "No rework needed - got it right the first time"

4. **Collaboration**: Teamwork patterns
   - "Clear planning phase aligned expectations"
   - "Effective use of AskUserQuestion prevented wrong paths"
   - "Good communication about trade-offs"

5. **Quality**: Robustness and maintainability
   - "Comprehensive test coverage from the start"
   - "Documentation written before code"
   - "Error handling built in from day one"

EXAMPLES:

✅ GOOD - Specific velocity win:
{
  "what": "Rapid TypeScript project scaffolding",
  "why_noteworthy": "Created production-ready repo structure with 18 files (tooling, config, docs) in under 40 minutes with zero compile errors",
  "category": "velocity",
  "evidence": "Messages 10-50 show continuous Write tool usage creating package.json, tsconfig.json, jest.config, multiple .md files, all successful"
}

✅ GOOD - Efficiency win:
{
  "what": "Tests passed on first run",
  "why_noteworthy": "Jest test suite executed successfully without any fixes needed, indicating clean implementation",
  "category": "efficiency",
  "evidence": "Message 67: npm test returned exit code 0 with all tests passing"
}

✅ GOOD - Collaboration win:
{
  "what": "Documentation-first approach aligned team",
  "why_noteworthy": "Writing PLAN.md and PROJECT.md before coding prevented scope creep and kept implementation focused",
  "category": "collaboration",
  "evidence": "Messages 12-30 created 5 .md files before any .ts files, later phases referenced these docs"
}

❌ BAD - Vague:
{
  "what": "Everything went well",
  "why_noteworthy": "Good session"
}

❌ BAD - No evidence:
{
  "what": "Fast implementation",
  "category": "velocity"
}

Respond with valid JSON only.`;

export async function extractSuccesses(
  client: OpenAIClient,
  digest: SessionDigest
): Promise<SuccessesIdentified> {
  const userPrompt = buildUserPrompt(digest);

  const result = await client.callStructured<SuccessesIdentified>(
    'success-extraction',
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: 8000,
    }
  );

  return result;
}

function buildUserPrompt(digest: SessionDigest): string {
  const parts: string[] = ['Identify ALL successes and positive patterns in this session:\n'];

  parts.push('## SESSION OVERVIEW');
  parts.push(`Goal: "${digest.session_opening.initial_request}"`);
  parts.push(`Duration: ~${digest.session_stats.duration_estimate_minutes} minutes`);
  parts.push(`Total messages: ${digest.session_stats.total_messages}\n`);

  // Tools used (look for smooth patterns)
  parts.push('## TOOLS USED');
  digest.tool_summary.slice(0, 10).forEach((t) => {
    parts.push(`- ${t.tool_name}: ${t.count}x`);
  });

  // Files created (high count = velocity)
  if (digest.files_created.length > 0) {
    parts.push('\n## FILES CREATED (Velocity Indicator)');
    parts.push(`Created ${digest.files_created.length} files:`);
    digest.files_created.slice(0, 15).forEach((f) => {
      const fileName = f.split('/').pop() || f;
      parts.push(`  - ${fileName}`);
    });
  }

  // Files modified (low count relative to created = clean implementation)
  parts.push(`\n## FILES MODIFIED: ${digest.files_modified.length} files`);
  if (digest.files_modified.length > 0) {
    parts.push('(Low modify count relative to created = fewer corrections needed)');
  }

  // Decision points (good collaboration)
  if (digest.decision_points.length > 0) {
    parts.push('\n## DECISION POINTS (Collaboration Indicator)');
    parts.push(`${digest.decision_points.length} key decisions made:`);
    digest.decision_points.slice(0, 3).forEach((d) => {
      parts.push(`- Message ${d.message_index}: ${d.snippet.slice(0, 80)}`);
    });
  }

  // Phase transitions
  if (digest.phase_transitions.length > 0) {
    parts.push('\n## PHASE TRANSITIONS');
    digest.phase_transitions.forEach((t) => {
      parts.push(`- Message ${t.message_index}: ${t.indicator}`);
    });
  }

  // Request output
  parts.push('\n---\n');
  parts.push('Extract ALL successes in JSON format:');
  parts.push('{');
  parts.push('  "summary": "one-line summary of what went well",');
  parts.push('  "overall_velocity": "high|medium|low",');
  parts.push('  "successes": [');
  parts.push('    {');
  parts.push('      "what": "what went well",');
  parts.push('      "why_noteworthy": "why this success matters",');
  parts.push('      "message_range": [start, end],');
  parts.push('      "category": "velocity|elegance|efficiency|collaboration|quality",');
  parts.push('      "evidence": "specific proof from session (tool usage, message content, outcomes)"');
  parts.push('    }');
  parts.push('  ]');
  parts.push('}');

  return parts.join('\n');
}
