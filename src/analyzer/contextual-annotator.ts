/**
 * Contextual Annotator (Option C: Two-Pass Approach)
 *
 * Pass 1: Detect phases and task boundaries
 * Pass 2: Annotate each message with adaptive context
 */

import * as fs from 'fs';
import { OpenAIClient } from '../ai/client';
import { extractUserMessages } from '../prompts/user-message-annotation';
import { detectPhases, type PhaseDetectionResult } from '../prompts/phase-detection';
import {
  annotateWithContext,
  type ContextualAnnotationResult,
} from '../prompts/contextual-annotation';

export interface ContextualAnnotatorOptions {
  sessionPath: string;
  outputPath?: string;
  contextWindow?: number; // How many prior messages to include (default: 3)
}

export interface ContextualAnnotatorResult {
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

/**
 * Main entry point: Two-pass annotation with adaptive context
 */
export async function analyzeSessionContextual(
  client: OpenAIClient,
  options: ContextualAnnotatorOptions
): Promise<ContextualAnnotatorResult> {
  const contextWindow = options.contextWindow || 3;

  // Load session
  const sessionMessages = loadSessionFile(options.sessionPath);
  const userMessages = extractUserMessages(sessionMessages);

  if (userMessages.length === 0) {
    throw new Error('No user messages found in session file');
  }

  console.log(`📊 Found ${userMessages.length} user messages`);
  console.log('');

  // PASS 1: Detect phases
  console.log('🔍 Pass 1: Detecting phases and task boundaries...');
  const phases = await detectPhases(client, userMessages);
  console.log(`   Found ${phases.phases.length} phases`);
  console.log(`   Task boundaries at messages: ${phases.taskBoundaries.join(', ')}`);
  console.log('');

  // PASS 2: Annotate each message with context
  console.log('🎯 Pass 2: Annotating messages with adaptive context...');
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
    const phase = phases.phases.find((p) =>
      p.messageIndices.includes(currentMsg.index)
    );
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
    console.log(
      `   [${i + 1}/${userMessages.length}] Message #${currentMsg.index} → ${annotation.color}`
    );
  }

  console.log('');

  // Calculate stats
  const stats = calculateStats(sessionMessages.length, annotations);

  // Save to file if requested
  if (options.outputPath) {
    saveAnnotations(options.outputPath, { phases, annotations });
  }

  return {
    phases,
    annotations,
    stats: {
      ...stats,
      totalApiCalls: 1 + userMessages.length, // 1 for phase detection + N for annotations
    },
  };
}

function loadSessionFile(filePath: string): any[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Session file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());

  return lines.map((line) => JSON.parse(line));
}

function calculateStats(
  totalMessages: number,
  annotations: ContextualAnnotationResult[]
): Omit<ContextualAnnotatorResult['stats'], 'totalApiCalls'> {
  return {
    totalMessages,
    userMessages: annotations.length,
    greenCount: annotations.filter((a) => a.color === 'green').length,
    yellowCount: annotations.filter((a) => a.color === 'yellow').length,
    redCount: annotations.filter((a) => a.color === 'red').length,
  };
}

function saveAnnotations(
  outputPath: string,
  data: { phases: PhaseDetectionResult; annotations: ContextualAnnotationResult[] }
): void {
  const output = JSON.stringify(data, null, 2);
  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log(`✅ Annotations saved to: ${outputPath}`);
  console.log('');
}

/**
 * Format annotations as human-readable text
 */
export function formatContextualAnnotations(
  result: ContextualAnnotatorResult
): string {
  const { phases, annotations, stats } = result;
  const lines: string[] = [];

  // Header
  lines.push('═══════════════════════════════════════════════════');
  lines.push('  CONTEXTUAL USER MESSAGE ANNOTATIONS (Option C)');
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
    const colorEmoji =
      ann.color === 'green' ? '🟢' : ann.color === 'yellow' ? '🟡' : '🔴';
    const contentPreview =
      ann.content.length > 60 ? ann.content.slice(0, 60) + '...' : ann.content;

    lines.push(`${colorEmoji} Message #${ann.messageIndex}`);
    lines.push(`   "${contentPreview}"`);
    lines.push(`   → ${ann.annotation}`);
    lines.push(`   Reasoning: ${ann.reasoning}`);
    lines.push('');
  });

  return lines.join('\n');
}
