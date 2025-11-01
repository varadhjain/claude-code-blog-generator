/**
 * Structured Learning Extraction
 *
 * Extracts evidence-backed learnings from the session.
 * Upgrades from theme strings to structured insights with proof.
 */

import { OpenAIClient } from '../ai/client';
import { SessionDigest } from '../analyzer/digest-builder';

export interface Learning {
  category: 'technical' | 'process' | 'tool-usage' | 'constraint-driven';
  insight: string; // The actual learning/lesson
  supporting_evidence: {
    message_indices: number[];
    description: string; // What in the session proves this
  };
  confidence: 'high' | 'medium' | 'low';
  actionable: boolean; // Can a reader apply this to their own work?
  applies_to: string[]; // Context where this learning is relevant (e.g., ["TypeScript projects", "CLI tools"])
}

export interface LearningsExtracted {
  learnings: Learning[];
  primary_lesson: string; // The single most important takeaway
  summary: string; // One-line summary of lessons learned
}

const SYSTEM_PROMPT = `You are an expert at extracting actionable, evidence-backed learnings from software development sessions.

Your task: Identify 3-5 specific lessons that can be learned from this session, backed by concrete evidence.

IMPORTANT: Only 3-5 learnings maximum. Focus on the most valuable insights.

LEARNING CATEGORIES:

1. **Technical**: Lessons about code, architecture, libraries, languages
   - "TypeScript's strictNullChecks requires explicit null handling throughout the codebase"
   - "Jest's setupFilesAfterEnv is better than setupFiles for test environment configuration"
   - "Async/await with try-catch is clearer than promise chains for error handling"

2. **Process**: Lessons about development workflow, methodology, planning
   - "Writing documentation before code clarifies requirements and prevents scope creep"
   - "Breaking work into milestones enables parallel development"
   - "Committing after each milestone provides clear rollback points"

3. **Tool-usage**: Lessons about using specific tools effectively
   - "Claude Code's ExitPlanMode helps transition from planning to execution explicitly"
   - "Using Write for new files and Edit for changes keeps intent clear"
   - "TodoWrite maintains focus and prevents forgetting tasks"

4. **Constraint-driven**: Lessons about working under constraints (time, cost, resources)
   - "Using gpt-5-nano instead of gpt-4 reduced costs by 85% with minimal quality loss"
   - "Session digests (3k tokens) enable analysis at 1/10th the cost of full transcripts"
   - "Two-stage analysis (digest → detailed) balances speed and thoroughness"

WHAT MAKES A GOOD LEARNING:

✅ **Specific**: Not vague generalizations
   - Good: "Writing PLAN.md before coding reduced back-and-forth by 40%"
   - Bad: "Planning is good"

✅ **Evidence-backed**: Tied to concrete session events
   - Good: "Tests passed on first run (message 67) because types were defined upfront (messages 12-20)"
   - Bad: "Types help" (no proof)

✅ **Actionable**: Reader can apply this to their work
   - Good: "Use gpt-5-nano for cost-sensitive analysis tasks - it's 85% cheaper with comparable output"
   - Bad: "AI models vary" (not actionable)

✅ **Contextual**: Clear when this applies
   - Good: "For TypeScript CLIs, define types before implementation to catch errors early"
   - Bad: "Define types first" (too broad)

CONFIDENCE LEVELS:

- **High**: Strong evidence (multiple instances, clear cause-effect)
  - "Documentation-first approach worked: 5 .md files created before any code, zero scope confusion later"

- **Medium**: Some evidence (one clear instance or pattern)
  - "Two-stage analysis might reduce costs: saved tokens in this session, but only tested once"

- **Low**: Hypothesis (interesting but speculative)
  - "Using emojis in commit messages may improve readability, but unclear from this session"

EVIDENCE REQUIREMENTS:

You MUST link each learning to specific messages:
- Which messages demonstrate this lesson?
- What happened that proves this insight?
- Can you point to before/after comparisons?

EXAMPLES:

✅ GOOD - Complete, actionable learning:
{
  "category": "process",
  "insight": "Documentation-first development prevents scope creep and aligns team expectations before coding begins",
  "supporting_evidence": {
    "message_indices": [12, 15, 18, 25, 30],
    "description": "PLAN.md, PROJECT.md, README.md, and QUICKSTART.md were written in messages 12-30 before any .ts files. Later phases (40-120) referenced these docs and stayed on track with zero scope debates."
  },
  "confidence": "high",
  "actionable": true,
  "applies_to": ["greenfield projects", "team collaboration", "ambiguous requirements"]
}

✅ GOOD - Technical learning with proof:
{
  "category": "technical",
  "insight": "gpt-5-nano requires max_completion_tokens instead of max_tokens parameter",
  "supporting_evidence": {
    "message_indices": [55, 58],
    "description": "Initial API call with max_tokens failed with 400 error (message 55). Switching to max_completion_tokens succeeded (message 58)."
  },
  "confidence": "high",
  "actionable": true,
  "applies_to": ["OpenAI API", "gpt-5-nano", "reasoning models"]
}

❌ BAD - Vague, no evidence:
{
  "category": "technical",
  "insight": "TypeScript is good",
  "confidence": "high",
  "actionable": false
}

❌ BAD - No evidence linkage:
{
  "category": "process",
  "insight": "Planning helps development",
  "supporting_evidence": {
    "description": "Planning happened"
  }
}

Respond with valid JSON only.`;

export async function extractLearnings(
  client: OpenAIClient,
  digest: SessionDigest
): Promise<LearningsExtracted> {
  const userPrompt = buildUserPrompt(digest);

  const result = await client.callStructured<LearningsExtracted>(
    'structured-learning',
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: 8000,
    }
  );

  return result;
}

function buildUserPrompt(digest: SessionDigest): string {
  const parts: string[] = [
    'Extract actionable, evidence-backed learnings from this session:\n',
  ];

  parts.push('## SESSION OVERVIEW');
  parts.push(`Goal: "${digest.session_opening.initial_request}"`);
  parts.push(`Duration: ~${digest.session_stats.duration_estimate_minutes} minutes`);
  parts.push(`Total messages: ${digest.session_stats.total_messages}\n`);

  // Tools used (tool usage patterns teach lessons)
  parts.push('## TOOLS USED');
  digest.tool_summary.slice(0, 10).forEach((t) => {
    parts.push(
      `- ${t.tool_name}: ${t.count}x (first: msg ${t.first_used_at_msg}, last: msg ${t.last_used_at_msg})`
    );
  });

  // Files created (order and types teach about approach)
  if (digest.files_created.length > 0) {
    parts.push('\n## FILES CREATED (Order Matters)');
    digest.files_created.slice(0, 20).forEach((f) => {
      const fileName = f.split('/').pop() || f;
      parts.push(`  - ${fileName}`);
    });
  }

  // Decision points (decisions often teach lessons)
  if (digest.decision_points.length > 0) {
    parts.push('\n## KEY DECISIONS');
    digest.decision_points.slice(0, 5).forEach((d) => {
      parts.push(`- Message ${d.message_index}: ${d.snippet.slice(0, 120)}`);
    });
  }

  // Phase transitions (transitions reveal workflow patterns)
  if (digest.phase_transitions.length > 0) {
    parts.push('\n## PHASE TRANSITIONS');
    digest.phase_transitions.forEach((t) => {
      parts.push(`- Message ${t.message_index}: ${t.indicator}`);
    });
  }

  // Request output
  parts.push('\n---\n');
  parts.push('Extract learnings in JSON format:');
  parts.push('{');
  parts.push('  "summary": "one-line summary of lessons learned",');
  parts.push('  "primary_lesson": "the single most important takeaway from this session",');
  parts.push('  "learnings": [');
  parts.push('    {');
  parts.push('      "category": "technical|process|tool-usage|constraint-driven",');
  parts.push('      "insight": "the actual learning/lesson",');
  parts.push('      "supporting_evidence": {');
  parts.push('        "message_indices": [list of message numbers that prove this],');
  parts.push(
    '        "description": "what happened in those messages that demonstrates this lesson"'
  );
  parts.push('      },');
  parts.push('      "confidence": "high|medium|low",');
  parts.push('      "actionable": true|false,');
  parts.push(
    '      "applies_to": ["contexts where this learning is relevant, e.g., TypeScript projects, CLI tools"]'
  );
  parts.push('    }');
  parts.push('  ]');
  parts.push('}');

  return parts.join('\n');
}
