/**
 * Contextual Annotation Prompt (Pass 2 for Option C)
 *
 * Annotates a single user message with context from prior messages
 */

import { OpenAIClient } from '../../ai/client';
import { AnnotationColor } from './user-message-annotation';

export interface ContextualAnnotationInput {
  currentMessage: {
    index: number;
    content: string;
  };
  priorMessages: Array<{
    index: number;
    content: string;
  }>;
  phaseContext?: {
    phaseName: string;
    phaseDescription: string;
    isFirstInPhase: boolean; // Strong signal for green
  };
}

export interface ContextualAnnotationResult {
  messageIndex: number;
  content: string;
  annotation: string;
  color: AnnotationColor;
  reasoning: string; // Why this color was chosen (for debugging)
}

const SYSTEM_PROMPT = `You are an expert at analyzing software development conversations.

Your task: Annotate ONE user message with context from prior messages.

COLOR MEANINGS:
🟢 GREEN - Starting a new task or phase
  * First message in a new phase
  * "Let's build X", "Now let's add Y"
  * Clear shift to new goal

🟡 YELLOW - Steering or correcting ongoing work
  * "Actually, do it this way"
  * "Can you also add..."
  * Minor adjustments within same task
  * Providing clarifications

🔴 RED - Major issue or restart
  * "This is all wrong, start over"
  * "Stop, we need a different approach"
  * Complete pivot or error recovery

CONTEXT USAGE:
- Prior messages show what the user was working on
- If current message continues the same work → YELLOW
- If current message starts something new → GREEN
- If current message indicates major problem → RED
- Phase context helps: if it's first in phase → likely GREEN

EXAMPLES:

Input:
{
  "currentMessage": {index: 5, content: "Actually use gpt-4o-mini instead"},
  "priorMessages": [
    {index: 4, content: "Set up the AI client with GPT-4"}
  ],
  "phaseContext": {
    "phaseName": "Initial Setup",
    "isFirstInPhase": false
  }
}

Output:
{
  "messageIndex": 5,
  "content": "Actually use gpt-4o-mini instead",
  "annotation": "Correcting model choice for cost",
  "color": "yellow",
  "reasoning": "User is correcting a detail in ongoing setup (same phase, minor adjustment)"
}

Respond with valid JSON only, no additional text.`;

export async function annotateWithContext(
  client: OpenAIClient,
  input: ContextualAnnotationInput
): Promise<ContextualAnnotationResult> {
  const userPrompt = buildUserPrompt(input);

  const result = await client.callStructured<ContextualAnnotationResult>(
    'contextual-annotation',
    SYSTEM_PROMPT,
    userPrompt,
    {
      temperature: 0.3,
      maxTokens: 200,
    }
  );

  return result;
}

function buildUserPrompt(input: ContextualAnnotationInput): string {
  const parts: string[] = [];

  // Add phase context if available
  if (input.phaseContext) {
    parts.push('PHASE CONTEXT:');
    parts.push(`  Phase: ${input.phaseContext.phaseName}`);
    parts.push(`  Description: ${input.phaseContext.phaseDescription}`);
    parts.push(
      `  First in phase: ${input.phaseContext.isFirstInPhase ? 'YES (likely GREEN)' : 'NO'}`
    );
    parts.push('');
  }

  // Add prior messages for context
  if (input.priorMessages.length > 0) {
    parts.push('PRIOR MESSAGES (for context):');
    input.priorMessages.forEach((msg) => {
      const content =
        msg.content.length > 150 ? msg.content.slice(0, 150) + '...' : msg.content;
      parts.push(`  ${msg.index}. ${content}`);
    });
    parts.push('');
  }

  // Add current message to annotate
  parts.push('CURRENT MESSAGE TO ANNOTATE:');
  const content =
    input.currentMessage.content.length > 300
      ? input.currentMessage.content.slice(0, 300) + '...'
      : input.currentMessage.content;
  parts.push(`  ${input.currentMessage.index}. ${content}`);

  parts.push(
    '\nRespond with JSON in this exact format:',
    '{',
    '  "messageIndex": number,',
    '  "content": "message text (truncated if needed)",',
    '  "annotation": "5-10 word explanation",',
    '  "color": "green|yellow|red",',
    '  "reasoning": "brief explanation of why this color"',
    '}'
  );

  return parts.join('\n');
}
