/**
 * Phase Summary Prompt
 *
 * Generates a 2-3 sentence narrative summary for an entire phase
 */

import { OpenAIClient } from '../ai/client';
import { PhaseType } from './phase-classification';

export interface PhaseData {
  phase_type: PhaseType;
  message_count: number;
  duration_minutes?: number;
  tools_used: Record<string, number>; // tool name -> count
  files_created?: string[];
  files_modified?: string[];
  key_actions: string[];
  objective?: string;
}

export interface PhaseSummary {
  summary: string;
  highlights: string[];
}

const SYSTEM_PROMPT = `You are an expert technical writer who creates concise, engaging narratives from software development sessions.

Your task is to write a 2-3 sentence summary of a development phase that:
- Describes what was accomplished (not just what was attempted)
- Includes specific details (file names, numbers, concrete actions)
- Uses active voice and clear language
- Sounds natural, not robotic

GOOD EXAMPLES:
"The assistant implemented JWT-based authentication by creating src/auth.ts with login/logout functions. After writing initial tests, TypeScript errors were fixed by adding proper type definitions. The implementation took 15 messages and involved 5 file writes."

"Initial exploration focused on understanding the existing codebase structure. Using Read and Glob tools, the assistant examined 8 files across the src/ directory to map out component relationships and identify where the new feature would integrate."

BAD EXAMPLES:
"In this phase, coding activities occurred. Files were written. Tests were created." (Too vague)
"The absolutely amazing implementation perfectly solved all problems!" (Too hyperbolic)
"TODO: implement auth, add tests, fix errors" (List not narrative)

Keep it factual, specific, and readable. Respond with valid JSON only.`;

export async function summarizePhase(
  client: OpenAIClient,
  phaseData: PhaseData
): Promise<PhaseSummary> {
  const userPrompt = buildUserPrompt(phaseData);

  const result = await client.callStructured<PhaseSummary>(
    'phase-summary',
    SYSTEM_PROMPT,
    userPrompt,
    {
      temperature: 0.7,
      maxTokens: 400,
    }
  );

  return result;
}

function buildUserPrompt(data: PhaseData): string {
  const parts: string[] = [`Summarize this ${data.phase_type} phase:\n`];

  parts.push(`PHASE TYPE: ${data.phase_type}`);
  parts.push(`MESSAGE COUNT: ${data.message_count}`);

  if (data.duration_minutes) {
    parts.push(`DURATION: ~${data.duration_minutes} minutes`);
  }

  if (data.objective) {
    parts.push(`OBJECTIVE: ${data.objective}`);
  }

  // Tools used
  if (Object.keys(data.tools_used).length > 0) {
    parts.push('\nTOOLS USED:');
    for (const [tool, count] of Object.entries(data.tools_used).sort(
      (a, b) => b[1] - a[1]
    )) {
      parts.push(`- ${tool}: ${count}x`);
    }
  }

  // Files
  if (data.files_created && data.files_created.length > 0) {
    parts.push('\nFILES CREATED:');
    data.files_created.slice(0, 10).forEach((f) => parts.push(`- ${f}`));
    if (data.files_created.length > 10) {
      parts.push(`... and ${data.files_created.length - 10} more`);
    }
  }

  if (data.files_modified && data.files_modified.length > 0) {
    parts.push('\nFILES MODIFIED:');
    data.files_modified.slice(0, 10).forEach((f) => parts.push(`- ${f}`));
    if (data.files_modified.length > 10) {
      parts.push(`... and ${data.files_modified.length - 10} more`);
    }
  }

  // Key actions
  if (data.key_actions.length > 0) {
    parts.push('\nKEY ACTIONS:');
    data.key_actions.forEach((action) => parts.push(`- ${action}`));
  }

  parts.push(
    '\nRespond with JSON in this format:',
    '{',
    '  "summary": "2-3 sentence narrative summary",',
    '  "highlights": ["key point 1", "key point 2", "key point 3"]',
    '}'
  );

  return parts.join('\n');
}
