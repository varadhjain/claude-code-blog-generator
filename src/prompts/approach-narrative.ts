/**
 * Approach Narrative
 *
 * Synthesizes HOW the user approached the problem into a coherent narrative.
 * Combines session type, key decisions, tool patterns, and phases into a story.
 */

import { OpenAIClient } from '../ai/client';
import { SessionDigest } from '../analyzer/digest-builder';

export interface ApproachNarrative {
  high_level_strategy: string; // 2-3 sentences describing overall approach
  key_characteristics: string[]; // 3-5 defining traits (e.g., "documentation-first", "test-driven", "iterative")
  workflow_pattern: string; // The general workflow (e.g., "plan → scaffold → implement → test → refine")
  notable_decisions: Array<{
    what: string;
    why: string;
    when_message: number;
    impact: string; // How this decision shaped the rest of the session
  }>;
  evolution: string; // How the approach evolved during the session (if it did)
}

const SYSTEM_PROMPT = `You are an expert at synthesizing software development approaches into clear narratives.

Your task: Describe HOW the user approached the problem, not just what they did.

WHAT TO CAPTURE:

1. **High-level strategy**: The overall game plan
   - "Documentation-driven development: wrote comprehensive docs before any code"
   - "Rapid prototyping: built working version first, refined later"
   - "Test-first approach: defined test cases before implementation"
   - "Exploratory coding: learned by experimentation and iteration"

2. **Key characteristics**: Defining traits of this approach
   - "Planning-heavy" (many TodoWrite, ExitPlanMode)
   - "Iterative" (many small cycles of code → test → refine)
   - "Quality-focused" (tests and docs throughout)
   - "Speed-optimized" (minimal planning, straight to coding)
   - "Collaborative" (frequent AskUserQuestion, discussion)
   - "Cost-conscious" (optimizations for token/API costs)

3. **Workflow pattern**: The phases and their order
   - "Explore → Plan → Implement → Test → Deploy"
   - "Design → Code → Refactor → Document"
   - "Spike → Throw away → Rebuild properly"

4. **Notable decisions that shaped the approach**:
   - "Chose TypeScript for type safety, which caught 15 errors before runtime"
   - "Decided to write PLAN.md before coding, which prevented scope creep"
   - "Used gpt-5-nano instead of gpt-4o to reduce costs by 85%"

5. **Evolution**: How the approach changed
   - "Started with broad exploration, pivoted to focused implementation after understanding codebase"
   - "Initial spike revealed performance issues, switched to optimized algorithm"
   - "Began without tests, hit bugs, added testing infrastructure"

ANALYSIS SIGNALS:

**Tool patterns reveal approach:**
- High Read/Glob early → exploratory start
- Write before Edit → clean implementation
- Many Edit → iterative refinement
- Bash (tests) throughout → test-driven
- TodoWrite + ExitPlanMode → planning-focused
- AskUserQuestion frequent → collaborative
- Write (.md files) before .ts → docs-first

**File creation order reveals strategy:**
- Docs before code → planning-focused
- Tests before implementation → TDD
- Config files first → setup-focused
- Rapid .ts creation → speed-focused

**Phase transitions reveal workflow:**
- Clean phase boundaries → structured approach
- Many micro-phases → iterative
- Long planning phase → upfront design
- Debugging late → quality implementation

EXAMPLES:

✅ GOOD - Complete narrative:
{
  "high_level_strategy": "Documentation-driven development with milestone-based planning. The team wrote comprehensive planning docs (PLAN.md, PROJECT.md, MILESTONES.md) before any code, then systematically implemented features following the documented plan.",
  "key_characteristics": ["planning-heavy", "documentation-first", "collaborative", "milestone-driven", "GitHub-ready from start"],
  "workflow_pattern": "Plan (docs, milestones) → Scaffold (config, types) → Implement (features) → Polish (refine docs) → Publish (GitHub)",
  "notable_decisions": [
    {
      "what": "Write comprehensive PLAN.md before coding",
      "why": "Align collaborators and prevent scope creep",
      "when_message": 15,
      "impact": "All subsequent work referenced the plan, zero scope debates"
    },
    {
      "what": "Create MILESTONES.md for parallel work",
      "why": "Enable Wilhelm to work independently",
      "when_message": 138,
      "impact": "Clear ownership and standalone work packages"
    }
  ],
  "evolution": "Approach remained consistent: started with planning intent and maintained documentation-first discipline throughout all 149 messages."
}

✅ GOOD - With evolution:
{
  "high_level_strategy": "Started with exploratory coding to understand the problem, then pivoted to structured implementation with proper types and tests after discovering edge cases.",
  "key_characteristics": ["exploratory start", "iterative", "test-added-late", "refactoring-heavy"],
  "workflow_pattern": "Explore (spike code) → Discover problems → Refactor (add types) → Test (catch remaining issues) → Finalize",
  "notable_decisions": [
    {
      "what": "Add TypeScript after initial JS spike",
      "why": "Hit runtime errors that types would have caught",
      "when_message": 45,
      "impact": "Prevented 10+ similar errors in later development"
    }
  ],
  "evolution": "Shifted from 'code fast and fix' to 'define types first' after hitting bugs in messages 40-50. Later phases (60-100) had zero type errors."
}

❌ BAD - Vague:
{
  "high_level_strategy": "They coded and it worked",
  "workflow_pattern": "Standard development"
}

❌ BAD - No evidence:
{
  "high_level_strategy": "Test-driven development",
  "key_characteristics": ["TDD"]
  // But tool usage shows tests written AFTER code, not before
}

Be specific and evidence-based. Respond with valid JSON only.`;

export async function buildApproachNarrative(
  client: OpenAIClient,
  digest: SessionDigest
): Promise<ApproachNarrative> {
  const userPrompt = buildUserPrompt(digest);

  const result = await client.callStructured<ApproachNarrative>(
    'approach-narrative',
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: 8000,
    }
  );

  return result;
}

function buildUserPrompt(digest: SessionDigest): string {
  const parts: string[] = ['Describe HOW the user approached this problem:\n'];

  parts.push('## SESSION OVERVIEW');
  parts.push(`Goal: "${digest.session_opening.initial_request}"`);
  parts.push(`Duration: ~${digest.session_stats.duration_estimate_minutes} minutes`);
  parts.push(`Total messages: ${digest.session_stats.total_messages}\n`);

  // Early messages (reveal initial strategy)
  parts.push('## SESSION OPENING (First few messages)');
  parts.push(`Initial request: ${digest.session_opening.initial_request.slice(0, 200)}`);
  if (digest.session_opening.early_context.length > 0) {
    digest.session_opening.early_context.slice(0, 3).forEach((ctx, i) => {
      const preview = ctx.slice(0, 200);
      parts.push(`Context ${i + 1}: ${preview}${ctx.length > 200 ? '...' : ''}`);
    });
  }

  // Tools used (patterns reveal approach)
  parts.push('\n## TOOL USAGE PATTERNS');
  digest.tool_summary.slice(0, 12).forEach((t) => {
    parts.push(
      `- ${t.tool_name}: ${t.count}x (first used: msg ${t.first_used_at_msg}, last: msg ${t.last_used_at_msg})`
    );
  });

  // Files created in order (reveals strategy)
  if (digest.files_created.length > 0) {
    parts.push('\n## FILE CREATION ORDER (Reveals Strategy)');
    digest.files_created.slice(0, 20).forEach((f, i) => {
      const fileName = f.split('/').pop() || f;
      parts.push(`  ${i + 1}. ${fileName}`);
    });
  }

  // Decision points (key choices that shaped approach)
  if (digest.decision_points.length > 0) {
    parts.push('\n## KEY DECISION POINTS');
    digest.decision_points.slice(0, 5).forEach((d) => {
      parts.push(`- Message ${d.message_index}: ${d.snippet.slice(0, 150)}`);
    });
  }

  // Phase transitions (workflow structure)
  if (digest.phase_transitions.length > 0) {
    parts.push('\n## PHASE TRANSITIONS (Workflow Structure)');
    digest.phase_transitions.forEach((t) => {
      parts.push(`- Message ${t.message_index}: ${t.indicator}`);
    });
  }

  // Session ending (how it concluded)
  if (digest.session_ending) {
    parts.push('\n## SESSION ENDING');
    parts.push(`Final messages: ${digest.session_ending.final_messages.length}`);
    if (digest.session_ending.final_tool_uses.length > 0) {
      parts.push(`Final tools: ${digest.session_ending.final_tool_uses.join(', ')}`);
    }
  }

  // Request output
  parts.push('\n---\n');
  parts.push('Describe the approach in JSON format:');
  parts.push('{');
  parts.push(
    '  "high_level_strategy": "2-3 sentences describing overall approach (docs-first, TDD, exploratory, etc.)",'
  );
  parts.push(
    '  "key_characteristics": ["3-5 defining traits like planning-heavy, iterative, collaborative"],'
  );
  parts.push(
    '  "workflow_pattern": "the general workflow pattern (e.g., plan → scaffold → implement → test)",'
  );
  parts.push('  "notable_decisions": [');
  parts.push('    {');
  parts.push('      "what": "decision made",');
  parts.push('      "why": "reason for decision",');
  parts.push('      "when_message": <message number>,');
  parts.push('      "impact": "how this decision shaped the rest of the session"');
  parts.push('    }');
  parts.push('  ],');
  parts.push(
    '  "evolution": "how the approach evolved during the session (or stayed consistent)"'
  );
  parts.push('}');

  return parts.join('\n');
}
