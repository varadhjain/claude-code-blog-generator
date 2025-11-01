/**
 * User Message Annotator
 *
 * Main logic for extracting user messages from session JSONL
 * and annotating them with AI-powered insights
 */

import * as fs from 'fs';
import {
  annotateUserMessages,
  extractUserMessages,
  type AnnotationResult,
} from '../prompts/user-message-annotation';
import { OpenAIClient } from '../ai/client';

export interface AnnotatorOptions {
  sessionPath: string; // Path to .jsonl file
  outputPath?: string; // Optional: save JSON output to file
}

export interface AnnotatorResult {
  annotations: AnnotationResult;
  stats: {
    totalMessages: number;
    userMessages: number;
    greenCount: number;
    yellowCount: number;
    redCount: number;
  };
}

/**
 * Main entry point: analyze a session and annotate user messages
 */
export async function analyzeSession(
  client: OpenAIClient,
  options: AnnotatorOptions
): Promise<AnnotatorResult> {
  // 1. Load and parse JSONL
  const sessionMessages = loadSessionFile(options.sessionPath);

  // 2. Extract user messages
  const userMessages = extractUserMessages(sessionMessages);

  if (userMessages.length === 0) {
    throw new Error('No user messages found in session file');
  }

  // 3. Get AI annotations
  const annotations = await annotateUserMessages(client, userMessages);

  // 4. Calculate stats
  const stats = calculateStats(sessionMessages.length, annotations);

  // 5. Optionally save to file
  if (options.outputPath) {
    saveAnnotations(options.outputPath, annotations);
  }

  return {
    annotations,
    stats,
  };
}

/**
 * Load JSONL session file
 */
function loadSessionFile(filePath: string): any[] {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Session file not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());

  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch (err) {
      throw new Error(`Failed to parse JSONL line: ${line.slice(0, 100)}`);
    }
  });
}

/**
 * Calculate statistics from annotations
 */
function calculateStats(
  totalMessages: number,
  annotations: AnnotationResult
): AnnotatorResult['stats'] {
  const greenCount = annotations.annotations.filter(
    (a) => a.color === 'green'
  ).length;
  const yellowCount = annotations.annotations.filter(
    (a) => a.color === 'yellow'
  ).length;
  const redCount = annotations.annotations.filter(
    (a) => a.color === 'red'
  ).length;

  return {
    totalMessages,
    userMessages: annotations.annotations.length,
    greenCount,
    yellowCount,
    redCount,
  };
}

/**
 * Save annotations to JSON file
 */
function saveAnnotations(outputPath: string, annotations: AnnotationResult): void {
  const output = JSON.stringify(annotations, null, 2);
  fs.writeFileSync(outputPath, output, 'utf-8');
  console.log(`\n✅ Annotations saved to: ${outputPath}`);
}

/**
 * Format annotations as human-readable text
 */
export function formatAnnotations(result: AnnotatorResult): string {
  const { annotations, stats } = result;
  const lines: string[] = [];

  // Header
  lines.push('═══════════════════════════════════════════════════');
  lines.push('  USER MESSAGE ANNOTATIONS');
  lines.push('═══════════════════════════════════════════════════');
  lines.push('');

  // Summary
  lines.push('📊 SESSION SUMMARY');
  lines.push(`   ${annotations.summary}`);
  lines.push('');

  // Stats
  lines.push('📈 STATISTICS');
  lines.push(`   Total messages: ${stats.totalMessages}`);
  lines.push(`   User messages: ${stats.userMessages}`);
  lines.push(`   🟢 Green (new tasks): ${stats.greenCount}`);
  lines.push(`   🟡 Yellow (steering): ${stats.yellowCount}`);
  lines.push(`   🔴 Red (restarts): ${stats.redCount}`);
  lines.push('');

  // Annotations
  lines.push('💬 ANNOTATED MESSAGES');
  lines.push('');

  annotations.annotations.forEach((ann) => {
    const colorEmoji =
      ann.color === 'green' ? '🟢' : ann.color === 'yellow' ? '🟡' : '🔴';
    const contentPreview =
      ann.content.length > 60 ? ann.content.slice(0, 60) + '...' : ann.content;

    lines.push(`${colorEmoji} Message #${ann.messageIndex}`);
    lines.push(`   "${contentPreview}"`);
    lines.push(`   → ${ann.annotation}`);
    lines.push('');
  });

  return lines.join('\n');
}
