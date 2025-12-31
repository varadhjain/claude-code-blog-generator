/**
 * User Message Annotations - Complete System
 *
 * Two-pass contextual analysis:
 * - Pass 1: Detect phases and task boundaries
 * - Pass 2: Annotate each message with adaptive context
 */

import * as fs from 'fs';
import { OpenAIClient } from './ai/client';

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

export interface AnnotatorOptions {
  sessionPath: string;
  outputPath?: string;
  contextWindow?: number;
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
    totalApiCalls: number;
  };
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

Respond with valid JSON only, no additional text.`;

async function detectPhases(
  client: OpenAIClient,
  messages: UserMessageInput[]
): Promise<PhaseDetectionResult> {
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

  const result = await client.callStructured<PhaseDetectionResult>(
    'phase-detection',
    PHASE_DETECTION_PROMPT,
    parts.join('\n'),
    { temperature: 0.3, maxTokens: 8000 } // Increased for gpt-5-nano reasoning model
  );

  return result;
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

Respond with valid JSON only, no additional text.`;

async function annotateWithContext(
  client: OpenAIClient,
  input: ContextualAnnotationInput
): Promise<ContextualAnnotationResult> {
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

  const result = await client.callStructured<ContextualAnnotationResult>(
    'contextual-annotation',
    CONTEXTUAL_ANNOTATION_PROMPT,
    parts.join('\n'),
    { temperature: 0.3, maxTokens: 2000 } // Increased for gpt-5-nano reasoning model
  );

  return result;
}

// ============================================================================
// MAIN ANALYSIS FUNCTION
// ============================================================================

export async function analyzeSession(
  client: OpenAIClient,
  options: AnnotatorOptions
): Promise<AnnotatorResult> {
  const contextWindow = options.contextWindow || 3;

  // Load session
  const sessionMessages = loadSessionFile(options.sessionPath);
  const userMessages = extractUserMessages(sessionMessages);

  if (userMessages.length === 0) {
    throw new Error('No user messages found in session file');
  }

  console.log(`Found ${userMessages.length} user messages to analyze\n`);

  // PASS 1: Detect phases
  console.log('⏳ Pass 1 of 2: Detecting phases and task boundaries...');
  const phases = await detectPhases(client, userMessages);
  console.log(`✓ Identified ${phases.phases.length} distinct phases`);
  if (phases.taskBoundaries.length > 0) {
    console.log(`✓ Task boundaries: ${phases.taskBoundaries.join(', ')}`);
  }
  console.log('');

  // PASS 2: Annotate each message with context
  console.log('⏳ Pass 2 of 2: Annotating messages with context...');
  const annotations: ContextualAnnotationResult[] = [];

  // Calculate percentage markers for progress
  const progressMarkers = [25, 50, 75];
  let lastMarker = 0;

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
    const annotation = await annotateWithContext(client, {
      currentMessage: {
        index: currentMsg.index,
        content: currentMsg.content,
      },
      priorMessages,
      phaseContext,
    });

    annotations.push(annotation);

    // Show progress at percentage markers
    const percentage = Math.floor(((i + 1) / userMessages.length) * 100);
    const nextMarker = progressMarkers.find(m => m > lastMarker && percentage >= m);

    if (nextMarker) {
      console.log(`   ${nextMarker}% complete (${i + 1}/${userMessages.length} messages annotated)`);
      lastMarker = nextMarker;
    }
  }

  console.log(`✓ All ${userMessages.length} messages annotated\n`);

  // Calculate stats
  const stats = {
    totalMessages: sessionMessages.length,
    userMessages: annotations.length,
    greenCount: annotations.filter((a) => a.color === 'green').length,
    yellowCount: annotations.filter((a) => a.color === 'yellow').length,
    redCount: annotations.filter((a) => a.color === 'red').length,
    totalApiCalls: 1 + userMessages.length,
  };

  // Save to file if requested
  if (options.outputPath) {
    const output = JSON.stringify({ phases, annotations }, null, 2);
    fs.writeFileSync(options.outputPath, output, 'utf-8');
    console.log(`✅ Annotations saved to: ${options.outputPath}`);
    console.log('');
  }

  return { phases, annotations, stats };
}

// ============================================================================
// FORMATTING
// ============================================================================

export function formatAnnotations(result: AnnotatorResult): string {
  const { phases, annotations, stats } = result;
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════');
  lines.push('  USER MESSAGE ANNOTATIONS');
  lines.push('═══════════════════════════════════════════════════');
  lines.push('');

  // Phases
  lines.push('📋 DETECTED PHASES');
  phases.phases.forEach((phase) => {
    lines.push(
      `   ${phase.phaseId}. ${phase.phaseName} (messages ${phase.messageIndices.join(', ')})`
    );
    lines.push(`      ${phase.description}`);
  });
  lines.push('');

  // Stats
  lines.push('📈 STATISTICS');
  lines.push(`   Total messages: ${stats.totalMessages}`);
  lines.push(`   User messages: ${stats.userMessages}`);
  lines.push(`   🟢 Green (new tasks): ${stats.greenCount}`);
  lines.push(`   🟡 Yellow (steering): ${stats.yellowCount}`);
  lines.push(`   🔴 Red (restarts): ${stats.redCount}`);
  lines.push(`   API calls: ${stats.totalApiCalls} (1 phase + ${stats.userMessages} annotations)`);
  lines.push('');

  // Annotations
  lines.push('💬 ANNOTATED MESSAGES');
  lines.push('');

  annotations.forEach((ann) => {
    const colorEmoji = ann.color === 'green' ? '🟢' : ann.color === 'yellow' ? '🟡' : '🔴';
    const contentPreview = ann.content.length > 60 ? ann.content.slice(0, 60) + '...' : ann.content;

    lines.push(`${colorEmoji} Message #${ann.messageIndex}`);
    lines.push(`   "${contentPreview}"`);
    lines.push(`   → ${ann.annotation}`);
    lines.push(`   Reasoning: ${ann.reasoning}`);
    lines.push('');
  });

  return lines.join('\n');
}

// ============================================================================
// HELPERS
// ============================================================================

function loadSessionFile(filePath: string): any[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Session file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());
  return lines.map((line) => JSON.parse(line));
}

function extractUserMessages(sessionMessages: any[]): UserMessageInput[] {
  const userMessages: UserMessageInput[] = [];
  let userMessageIndex = 0;

  sessionMessages.forEach((msg) => {
    // Only include actual user text messages (not tool results)
    if (msg.type === 'user' && msg.message?.content && typeof msg.message.content === 'string') {
      userMessages.push({
        index: userMessageIndex++,
        content: msg.message.content,
      });
    }
  });

  return userMessages;
}
