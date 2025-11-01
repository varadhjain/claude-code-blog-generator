#!/usr/bin/env ts-node
/**
 * Test script for gpt-5-nano prompts
 *
 * Focus: Test Phase Classification on multiple windows to iterate on the prompt
 */

import * as fs from 'fs';
import * as path from 'path';
import { OpenAIClient, TokenTracker } from '../src/ai/client';
import {
  classifyPhase,
  createMessageWindow,
  PhaseType,
} from '../src/prompts/phase-classification';
import { summarizePhase, PhaseData } from '../src/prompts/phase-summary';
import {
  detectDecision,
  isLikelyDecisionPoint,
} from '../src/prompts/decision-detection';

const EXAMPLE_SESSION = path.join(
  __dirname,
  '../examples/blog-post-generator-transcript.jsonl'
);

// Load session messages
function loadSession(filepath: string): any[] {
  const lines = fs.readFileSync(filepath, 'utf-8').split('\n');
  return lines
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
    .filter((msg) => msg.type === 'user' || msg.type === 'assistant');
}

// Group messages into sliding windows
function createWindows(messages: any[], windowSize: number = 5): any[][] {
  const windows: any[][] = [];
  for (let i = 0; i < messages.length - windowSize + 1; i += windowSize) {
    windows.push(messages.slice(i, i + windowSize));
  }
  return windows;
}

async function testPhaseClassification(
  client: OpenAIClient,
  messages: any[]
) {
  console.log('\n📍 TESTING PHASE CLASSIFICATION');
  console.log('='.repeat(80));

  // Test first 3 windows (messages 0-15)
  const windows = createWindows(messages, 5).slice(0, 3);

  for (let i = 0; i < windows.length; i++) {
    const window = windows[i];
    const messageWindow = createMessageWindow(window);

    console.log(`\n--- Window ${i + 1} (messages ${i * 5 + 1}-${i * 5 + 5}) ---`);
    console.log('Messages in window:');
    messageWindow.messages.forEach((msg, idx) => {
      const preview = msg.content.slice(0, 80).replace(/\n/g, ' ');
      console.log(`  ${idx + 1}. ${msg.role}: ${preview}...`);
      if (msg.tools_used) {
        console.log(`     Tools: ${msg.tools_used.join(', ')}`);
      }
    });

    const classification = await classifyPhase(client, messageWindow);

    console.log(`\n🎯 Classification:`);
    console.log(`  Phase: ${classification.phase}`);
    console.log(`  Confidence: ${(classification.confidence * 100).toFixed(0)}%`);
    console.log(`  Objective: ${classification.objective}`);
    console.log(`  Reasoning: ${classification.reasoning}`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function testPhaseSummary(client: OpenAIClient) {
  console.log('\n\n📝 TESTING PHASE SUMMARY');
  console.log('='.repeat(80));

  // Create sample phase data based on what we know from the example session
  const samplePhase: PhaseData = {
    phase_type: 'planning' as PhaseType,
    message_count: 40,
    duration_minutes: 35,
    tools_used: {
      WebFetch: 2,
      WebSearch: 1,
      AskUserQuestion: 2,
      ExitPlanMode: 3,
      Write: 8,
    },
    files_created: [
      'PROJECT.md',
      'MILESTONES.md',
      'WORK_BREAKDOWN.md',
      'package.json',
      'tsconfig.json',
      'src/types/index.ts',
      'src/cli/index.ts',
      'README.md',
    ],
    key_actions: [
      'Researched Mitchell Hashimoto blog style',
      'Chose TypeScript for type safety',
      'Created 8 milestone breakdown',
      'Defined core types for JSONL parsing',
      'Set up project structure',
    ],
    objective: 'Plan and scaffold blog post generator project',
  };

  console.log('\nPhase data:');
  console.log(`  Type: ${samplePhase.phase_type}`);
  console.log(`  Messages: ${samplePhase.message_count}`);
  console.log(`  Duration: ${samplePhase.duration_minutes} min`);
  console.log(`  Files created: ${samplePhase.files_created?.length}`);

  const summary = await summarizePhase(client, samplePhase);

  console.log(`\n📖 Summary:`);
  console.log(`  ${summary.summary}`);
  console.log(`\n✨ Highlights:`);
  summary.highlights.forEach((h) => console.log(`  - ${h}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function testDecisionDetection(client: OpenAIClient, messages: any[]) {
  console.log('\n\n🤔 TESTING DECISION POINT DETECTION');
  console.log('='.repeat(80));

  // Pre-filter to find likely decision points
  const windows = createWindows(messages, 3);
  const likelyDecisions = windows
    .map((w, idx) => ({ window: w, index: idx }))
    .filter((item) => isLikelyDecisionPoint(item.window))
    .slice(0, 3); // Test first 3 likely decisions

  console.log(
    `\nFound ${likelyDecisions.length} likely decision points (testing first 3):\n`
  );

  for (const { window, index } of likelyDecisions) {
    console.log(`\n--- Window ${index + 1} (messages ${index * 3 + 1}-${index * 3 + 3}) ---`);

    const context = {
      message_window: window.map((msg: any) => {
        let content = '';
        if (typeof msg.message?.content === 'string') {
          content = msg.message.content;
        } else if (Array.isArray(msg.message?.content)) {
          content = msg.message.content
            .filter((b: any) => b.type === 'text')
            .map((b: any) => b.text)
            .join(' ');
        }
        return {
          role: msg.type,
          content: content.slice(0, 300),
        };
      }),
      tools_used: window.flatMap((msg: any) => {
        if (Array.isArray(msg.message?.content)) {
          return msg.message.content
            .filter((b: any) => b.type === 'tool_use')
            .map((b: any) => b.name);
        }
        return [];
      }),
    };

    const decision = await detectDecision(client, context);

    console.log(`\n🎯 Decision Analysis:`);
    console.log(`  Is decision point: ${decision.is_decision_point ? 'YES' : 'NO'}`);
    if (decision.is_decision_point) {
      console.log(`  Decision: ${decision.decision}`);
      console.log(`  Reasoning: ${decision.reasoning}`);
      console.log(`  Impact: ${decision.impact}`);
      console.log(`  Category: ${decision.category}`);
      if (decision.alternatives_considered) {
        console.log(
          `  Alternatives: ${decision.alternatives_considered.join(', ')}`
        );
      }
    }
  }
}

async function main() {
  console.log('🚀 Testing gpt-5-nano Phase Classification');
  console.log('='.repeat(80));
  console.log(`Session file: ${EXAMPLE_SESSION}\n`);

  // Load session
  const messages = loadSession(EXAMPLE_SESSION);
  console.log(`Loaded ${messages.length} messages\n`);

  // Initialize client
  const tokenTracker = new TokenTracker();
  const client = new OpenAIClient(tokenTracker);

  try {
    // Focus on phase classification
    await testPhaseClassification(client, messages);

    // Uncomment these when phase classification is working well:
    // await testPhaseSummary(client);
    // await testDecisionDetection(client, messages);

    // Report token usage
    console.log(tokenTracker.report());
  } catch (error) {
    console.error('\n❌ Error during testing:', error);
    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
