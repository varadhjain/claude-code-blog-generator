/**
 * Meta-Analysis Prompt
 *
 * High-level session analysis using gpt-5-nano to identify:
 * - User's primary goal
 * - Major phases/sections
 * - Best blog template
 * - Narrative hooks and structure
 */

import { OpenAIClient } from '../../ai/client';
import { SessionDigest } from '../../analyzer/blog-generation/digest-builder';
import { SessionIndex, indexToText } from '../../analyzer/blog-generation/session-indexer';
import { BlogTemplate } from '../../types/templates';

export interface MetaAnalysis {
  user_goal: {
    primary_objective: string;
    secondary_objectives?: string[];
  };
  recommended_template: BlogTemplate;
  template_reasoning: string;
  suggested_phases: Array<{
    name: string;
    message_range: [number, number];
    primary_activity: string;
    why_distinct: string;
  }>;
  narrative_elements: {
    opening_hook: string;
    key_turning_points: string[];
    lessons_learned_themes: string[];
  };
  suggested_titles: string[];
  notes: {
    session_type: string;
    collaboration_detected: boolean;
    cost_consciousness: boolean;
    notable_patterns: string[];
  };
}

const SYSTEM_PROMPT = `You are an expert at analyzing software development sessions to identify their narrative structure and educational value.

Your task: Given a summary of a Claude Code session, determine the best way to turn it into an educational blog post.

AVAILABLE BLOG TEMPLATES:
1. "mitchell" - Personal narrative, problem → solution → lessons (like Mitchell Hashimoto's blog)
   Best for: Greenfield projects, feature implementation, learning journeys

2. "tutorial" - Step-by-step, reproducible instructions
   Best for: Project setup, configuration tasks, repeatable workflows

3. "archaeology" - Analytical, data-driven investigation of the session log
   Best for: Process analysis, tool usage patterns, meta-commentary

4. "technical-deep-dive" - Code-heavy, focused on specific implementation
   Best for: Algorithm implementation, architecture decisions, complex refactoring

5. "quick-win" - Short, punchy post about a single insight (500-1000 words)
   Best for: Short sessions, single tricks, aha moments, quick fixes

6. "case-study" - Problem → Investigation → Solution format
   Best for: Debugging sessions, error investigation, problem-solving

ANALYSIS GUIDELINES:
- Tool patterns reveal intent:
  * Read/Glob/Grep = exploration/setup
  * Write (new files) = coding/creation
  * Edit = refactoring/debugging
  * Bash (npm test, jest) = testing
  * TodoWrite/ExitPlanMode = planning
  * AskUserQuestion = decision points

- File patterns show scope:
  * Creating *.md files = documentation/planning
  * Creating *.ts/*.js = coding
  * Creating config files = setup
  * High Edit:Write ratio = refactoring

- Phase boundaries:
  * ExitPlanMode = transition from planning to execution
  * Errors = debugging phase starts
  * Test runs = testing phase
  * Multiple file creates in sequence = scaffolding phase

- Session types:
  * "greenfield" - New project, many Write calls for new files
  * "debugging" - Error messages, Edit calls, investigation
  * "refactoring" - High Edit:Write ratio, restructuring
  * "exploration" - Many Read calls, few Write calls
  * "planning" - TodoWrite, ExitPlanMode, documentation files

Your response should identify the narrative arc and suggest how to structure the blog post.

Respond with valid JSON only.`;

export async function metaAnalyze(
  client: OpenAIClient,
  digest: SessionDigest
): Promise<MetaAnalysis> {
  const userPrompt = buildUserPrompt(digest);

  const result = await client.callStructured<MetaAnalysis>(
    'meta-analysis',
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: 8000, // Increased for gpt-5-nano reasoning model (uses tokens for internal reasoning)
    }
  );

  return result;
}

/**
 * Meta-analyze using session index (for very long sessions)
 */
export async function metaAnalyzeFromIndex(
  client: OpenAIClient,
  index: SessionIndex
): Promise<MetaAnalysis> {
  const userPrompt = buildUserPromptFromIndex(index);

  const result = await client.callStructured<MetaAnalysis>(
    'meta-analysis-index',
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: 8000,
    }
  );

  return result;
}

function buildUserPrompt(digest: SessionDigest): string {
  const parts: string[] = ['Analyze this Claude Code session:\n'];

  // Opening
  parts.push('## SESSION OPENING');
  parts.push(`Initial request: "${digest.session_opening.initial_request}"`);
  if (digest.session_opening.early_context.length > 0) {
    parts.push('\nEarly context:');
    digest.session_opening.early_context.forEach((ctx, i) => {
      parts.push(`${i + 1}. ${ctx}`);
    });
  }

  // Stats
  parts.push('\n## SESSION STATISTICS');
  parts.push(`- Total messages: ${digest.session_stats.total_messages}`);
  parts.push(
    `- Duration: ~${digest.session_stats.duration_estimate_minutes} minutes`
  );
  for (const [type, count] of Object.entries(digest.session_stats.message_types)) {
    parts.push(`- ${type} messages: ${count}`);
  }

  // Tool usage
  parts.push('\n## TOOL USAGE PATTERNS');
  digest.tool_summary.forEach((t) => {
    parts.push(
      `- ${t.tool_name}: ${t.count}x (first at msg ${t.first_used_at_msg}, last at ${t.last_used_at_msg})`
    );
  });

  // Files
  parts.push('\n## FILES');
  if (digest.files_created.length > 0) {
    parts.push(`Created (${digest.files_created.length}):`);
    const display = digest.files_created.slice(0, 15);
    display.forEach((f) => parts.push(`  - ${f}`));
    if (digest.files_created.length > 15) {
      parts.push(`  ... and ${digest.files_created.length - 15} more`);
    }
  }

  if (digest.files_modified.length > 0) {
    parts.push(`\nModified (${digest.files_modified.length}):`);
    digest.files_modified.slice(0, 10).forEach((f) => parts.push(`  - ${f}`));
  }

  if (digest.files_read.length > 0) {
    parts.push(`\nMost-read: ${digest.files_read.slice(0, 5).join(', ')}`);
  }

  // Decision points
  if (digest.decision_points.length > 0) {
    parts.push('\n## KEY DECISION POINTS');
    digest.decision_points.forEach((d) => {
      parts.push(`- Message ${d.message_index} [${d.tool_used}]: ${d.snippet}`);
    });
  }

  // Phase transitions
  if (digest.phase_transitions.length > 0) {
    parts.push('\n## PHASE TRANSITIONS');
    digest.phase_transitions.slice(0, 10).forEach((t) => {
      parts.push(`- Message ${t.message_index}: ${t.indicator}`);
    });
  }

  // Ending
  parts.push('\n## SESSION ENDING');
  digest.session_ending.final_messages.forEach((msg, i) => {
    parts.push(`${i + 1}. ${msg}`);
  });
  if (digest.session_ending.final_tool_uses.length > 0) {
    parts.push(`Final tools: ${digest.session_ending.final_tool_uses.join(', ')}`);
  }

  // Request analysis
  parts.push('\n---\n');
  parts.push('Based on this session digest, provide a meta-analysis in JSON format:');
  parts.push('{');
  parts.push('  "user_goal": {');
  parts.push('    "primary_objective": "...",');
  parts.push('    "secondary_objectives": ["..."]');
  parts.push('  },');
  parts.push(
    '  "recommended_template": "mitchell|tutorial|archaeology|technical-deep-dive|quick-win|case-study",'
  );
  parts.push('  "template_reasoning": "why this template fits best",');
  parts.push('  "suggested_phases": [');
  parts.push('    {');
  parts.push('      "name": "Phase Name",');
  parts.push('      "message_range": [start, end],');
  parts.push('      "primary_activity": "what happened",');
  parts.push('      "why_distinct": "why this is a separate phase"');
  parts.push('    }');
  parts.push('  ],');
  parts.push('  "narrative_elements": {');
  parts.push('    "opening_hook": "compelling first paragraph",');
  parts.push('    "key_turning_points": ["moment 1", "moment 2"],');
  parts.push('    "lessons_learned_themes": ["theme 1", "theme 2"]');
  parts.push('  },');
  parts.push('  "suggested_titles": ["title 1", "title 2", "title 3"],');
  parts.push('  "notes": {');
  parts.push(
    '    "session_type": "greenfield|debugging|refactoring|exploration|planning",'
  );
  parts.push('    "collaboration_detected": true|false,');
  parts.push('    "cost_consciousness": true|false,');
  parts.push('    "notable_patterns": ["pattern 1", "pattern 2"]');
  parts.push('  }');
  parts.push('}');

  return parts.join('\n');
}

function buildUserPromptFromIndex(index: SessionIndex): string {
  const parts: string[] = ['Analyze this Claude Code session (provided as index):\n'];

  // Use the index text representation
  parts.push(indexToText(index));

  // Request analysis
  parts.push('\n---\n');
  parts.push('Based on this session index, provide a meta-analysis in JSON format:');
  parts.push('{');
  parts.push('  "user_goal": {');
  parts.push('    "primary_objective": "...",');
  parts.push('    "secondary_objectives": ["..."]');
  parts.push('  },');
  parts.push(
    '  "recommended_template": "mitchell|tutorial|archaeology|technical-deep-dive|quick-win|case-study",'
  );
  parts.push('  "template_reasoning": "why this template fits best",');
  parts.push('  "suggested_phases": [');
  parts.push('    {');
  parts.push('      "name": "Phase Name",');
  parts.push('      "message_range": [start, end],');
  parts.push('      "primary_activity": "what happened",');
  parts.push('      "why_distinct": "why this is a separate phase"');
  parts.push('    }');
  parts.push('  ],');
  parts.push('  "narrative_elements": {');
  parts.push('    "opening_hook": "compelling first paragraph",');
  parts.push('    "key_turning_points": ["moment 1", "moment 2"],');
  parts.push('    "lessons_learned_themes": ["theme 1", "theme 2"]');
  parts.push('  },');
  parts.push('  "suggested_titles": ["title 1", "title 2", "title 3"],');
  parts.push('  "notes": {');
  parts.push(
    '    "session_type": "greenfield|debugging|refactoring|exploration|planning",'
  );
  parts.push('    "collaboration_detected": true|false,');
  parts.push('    "cost_consciousness": true|false,');
  parts.push('    "notable_patterns": ["pattern 1", "pattern 2"]');
  parts.push('  }');
  parts.push('}');

  return parts.join('\n');
}
