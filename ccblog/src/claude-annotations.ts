/**
 * User Message Annotations using Claude Code CLI
 *
 * Analyzes user messages in Claude Code conversations using the claude CLI
 * to assign effectiveness ratings (green/yellow/red).
 */

import { spawnSync } from 'child_process';

// ============================================================================
// TYPES
// ============================================================================

export type AnnotationColor = 'green' | 'yellow' | 'red';

export interface UserMessageInput {
  index: number;
  content: string;
}

export interface UserMessagePhase {
  phaseId: number;
  phaseName: string;
  messageIndices: number[];
  description: string;
}

export interface PhaseDetectionResult {
  phases: UserMessagePhase[];
  taskBoundaries: number[];
}

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
    isFirstInPhase: boolean;
  };
}

export interface ContextualAnnotationResult {
  messageIndex: number;
  content: string;
  annotation: string;
  color: AnnotationColor;
  reasoning: string;
}

export interface AnnotatorResult {
  phases: PhaseDetectionResult;
  annotations: ContextualAnnotationResult[];
  stats: {
    totalMessages: number;
    userMessages: number;
    greenCount: number;
    yellowCount: number;
    redCount: number;
  };
}

// ============================================================================
// CLAUDE CLI WRAPPER
// ============================================================================

/**
 * Call claude CLI and parse JSON response
 */
function callClaudeCLI<T>(systemPrompt: string, userPrompt: string): T {
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  const result = spawnSync('claude', [
    '-p',
    fullPrompt,
    '--model',
    'claude-haiku-4-5',
    '--output-format',
    'json'
  ], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer
  });

  if (result.error) {
    throw new Error(`Failed to call claude CLI: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`Claude CLI exited with code ${result.status}: ${result.stderr}`);
  }

  const output = result.stdout;

  // Parse the outer JSON wrapper
  let responseWrapper: any;
  try {
    responseWrapper = JSON.parse(output);
  } catch (err) {
    throw new Error(`Failed to parse JSON wrapper from claude CLI: ${err}\nOutput: ${output}`);
  }

  // Check for errors
  if (responseWrapper.is_error) {
    throw new Error(`Claude CLI returned error: ${responseWrapper.result}`);
  }

  // Extract the actual response content
  const responseContent = responseWrapper.result;

  // Extract JSON from markdown code blocks if present
  const jsonMatch = responseContent.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonText = jsonMatch ? jsonMatch[1] : responseContent;

  try {
    return JSON.parse(jsonText.trim());
  } catch (err) {
    console.error('\n❌ Claude CLI returned non-JSON response:');
    console.error('---');
    console.error(responseContent);
    console.error('---');
    console.error('\nAttempted to parse:', jsonText.substring(0, 200));
    throw new Error(`Failed to parse JSON response from claude CLI: ${err}`);
  }
}

// ============================================================================
// PASS 1: PHASE DETECTION
// ============================================================================

const PHASE_DETECTION_PROMPT = `You are an expert at identifying task boundaries in software development sessions.

Your task: Analyze user messages and identify distinct phases/tasks.

WHAT IS A PHASE?
A phase is a cohesive unit of work where the user is focused on ONE goal:
- "Initial project setup"
- "Adding template system"
- "Debugging model configuration"
- "Preparing for deployment"

TASK BOUNDARIES (Green candidates):
These are messages where the user:
- Starts a completely new feature or task
- Shifts to a different area of work
- Says things like "Now let's...", "Next, we should...", "Great! Let's move on to..."

NOT task boundaries (Yellow/Red candidates):
- Clarifications within same task
- Minor corrections or additions
- Asking follow-up questions about current work
- Providing more context for ongoing task

IMPORTANT: You must ALWAYS respond with valid JSON in the exact format specified. Make your best judgment even if messages are unclear. Never provide explanatory text or ask questions.

Respond with valid JSON only, no additional text.`;

function detectPhases(messages: UserMessageInput[]): PhaseDetectionResult {
  const parts: string[] = [
    'Identify phases and task boundaries in these user messages:\n',
    'USER MESSAGES:',
  ];

  messages.forEach((msg) => {
    const content = msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content;
    parts.push(`${msg.index}. ${content}`);
  });

  parts.push(
    '\nRespond with JSON in this exact format:',
    '{',
    '  "phases": [',
    '    {',
    '      "phaseId": number,',
    '      "phaseName": "descriptive name",',
    '      "messageIndices": [array of message indices],',
    '      "description": "what user was trying to accomplish"',
    '    }',
    '  ],',
    '  "taskBoundaries": [array of message indices where new tasks start]',
    '}'
  );

  return callClaudeCLI<PhaseDetectionResult>(PHASE_DETECTION_PROMPT, parts.join('\n'));
}

// ============================================================================
// PASS 2: CONTEXTUAL ANNOTATION
// ============================================================================

const CONTEXTUAL_ANNOTATION_PROMPT = `You are an expert at analyzing software development conversations.

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

IMPORTANT: You must ALWAYS respond with valid JSON in the exact format specified, even if the message is unclear, meta-instruction, or system-generated. Make your best judgment and return JSON. Never ask questions or provide explanatory text.

If the message appears to be a system instruction or caveat, still classify it (likely YELLOW or RED depending on context).

Respond with valid JSON only, no additional text or questions.`;

function annotateWithContext(input: ContextualAnnotationInput): ContextualAnnotationResult {
  const parts: string[] = [];

  if (input.phaseContext) {
    parts.push('PHASE CONTEXT:');
    parts.push(`  Phase: ${input.phaseContext.phaseName}`);
    parts.push(`  Description: ${input.phaseContext.phaseDescription}`);
    parts.push(
      `  First in phase: ${input.phaseContext.isFirstInPhase ? 'YES (likely GREEN)' : 'NO'}`
    );
    parts.push('');
  }

  if (input.priorMessages.length > 0) {
    parts.push('PRIOR MESSAGES (for context):');
    input.priorMessages.forEach((msg) => {
      const content = msg.content.length > 150 ? msg.content.slice(0, 150) + '...' : msg.content;
      parts.push(`  ${msg.index}. ${content}`);
    });
    parts.push('');
  }

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

  return callClaudeCLI<ContextualAnnotationResult>(
    CONTEXTUAL_ANNOTATION_PROMPT,
    parts.join('\n')
  );
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

export async function analyzeConversation(
  userMessages: UserMessageInput[],
  contextWindow: number = 3
): Promise<AnnotatorResult> {
  if (userMessages.length === 0) {
    throw new Error('No user messages found');
  }

  console.error(`\n📊 Analyzing ${userMessages.length} user messages...\n`);

  // PASS 1: Detect phases
  console.error('🔍 Pass 1: Detecting phases and task boundaries...');
  const phases = detectPhases(userMessages);
  console.error(`   Found ${phases.phases.length} phases`);
  console.error(`   Task boundaries at messages: ${phases.taskBoundaries.join(', ')}`);
  console.error('');

  // PASS 2: Annotate each message with context
  console.error('🎯 Pass 2: Annotating messages with adaptive context...');
  const annotations: ContextualAnnotationResult[] = [];

  for (let i = 0; i < userMessages.length; i++) {
    const currentMsg = userMessages[i];

    // Get prior messages (adaptive window)
    const priorMessages = userMessages
      .slice(Math.max(0, i - contextWindow), i)
      .map((msg) => ({
        index: msg.index,
        content: msg.content,
      }));

    // Get phase context
    const phase = phases.phases.find((p) => p.messageIndices.includes(currentMsg.index));
    const phaseContext = phase
      ? {
          phaseName: phase.phaseName,
          phaseDescription: phase.description,
          isFirstInPhase: phase.messageIndices[0] === currentMsg.index,
        }
      : undefined;

    // Annotate with context
    const annotation = annotateWithContext({
      currentMessage: {
        index: currentMsg.index,
        content: currentMsg.content,
      },
      priorMessages,
      phaseContext,
    });

    annotations.push(annotation);
    console.error(
      `   [${i + 1}/${userMessages.length}] Message #${currentMsg.index} → ${annotation.color}`
    );
  }

  console.error('');

  // Calculate stats
  const stats = {
    totalMessages: userMessages.length,
    userMessages: annotations.length,
    greenCount: annotations.filter((a) => a.color === 'green').length,
    yellowCount: annotations.filter((a) => a.color === 'yellow').length,
    redCount: annotations.filter((a) => a.color === 'red').length,
  };

  return { phases, annotations, stats };
}

// ============================================================================
// EXTRACT USER MESSAGES FROM JSONL
// ============================================================================

export function extractUserMessages(sessionMessages: any[]): UserMessageInput[] {
  const userMessages: UserMessageInput[] = [];
  let userMessageIndex = 0;

  // System instruction patterns to filter out
  const systemInstructionPatterns = [
    /DO NOT respond to these messages/i,
    /The messages below were generated by the user while running local commands/i,
    /This is a system instruction/i,
    /^Warmup$/i,
  ];

  sessionMessages.forEach((msg) => {
    if (msg.type !== 'user' || !msg.message?.content) {
      return;
    }

    // Skip meta messages
    if (msg.isMeta) {
      return;
    }

    let textContent = '';

    // Handle string content
    if (typeof msg.message.content === 'string') {
      textContent = msg.message.content;
    }
    // Handle array content (extract text from text blocks, skip tool results)
    else if (Array.isArray(msg.message.content)) {
      const textBlocks = msg.message.content
        .filter((block: any) => block.type === 'text')
        .map((block: any) => block.text || '');
      textContent = textBlocks.join('\n').trim();
    }

    // Skip if no text content
    if (!textContent) {
      return;
    }

    // Skip system instruction messages
    const isSystemInstruction = systemInstructionPatterns.some(pattern =>
      pattern.test(textContent)
    );
    if (isSystemInstruction) {
      return;
    }

    // Add the message
    userMessages.push({
      index: userMessageIndex++,
      content: textContent,
    });
  });

  return userMessages;
}
