#!/usr/bin/env ts-node
/**
 * Test Phase Classification Prompt
 *
 * Focus: Test on multiple windows to iterate on the prompt
 */

import * as fs from 'fs';
import * as path from 'path';
import { OpenAIClient, TokenTracker } from '../src/ai/client';
import { classifyPhase, createMessageWindow } from '../src/prompts/phase-classification';

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

async function main() {
  console.log('🚀 Testing Phase Classification with gpt-5-nano');
  console.log('='.repeat(80));
  console.log(`Session file: ${EXAMPLE_SESSION}\n`);

  // Load session
  const messages = loadSession(EXAMPLE_SESSION);
  console.log(`Loaded ${messages.length} messages\n`);

  // Initialize client
  const tokenTracker = new TokenTracker();
  const client = new OpenAIClient(tokenTracker);

  try {
    // Test first 5 windows
    const windows = createWindows(messages, 5).slice(0, 5);

    for (let i = 0; i < windows.length; i++) {
      const window = windows[i];
      const messageWindow = createMessageWindow(window);

      console.log(`\n${'='.repeat(80)}`);
      console.log(`WINDOW ${i + 1} (messages ${i * 5 + 1}-${i * 5 + 5})`);
      console.log('='.repeat(80));

      // Show window contents
      console.log('\n📝 Messages in window:');
      messageWindow.messages.forEach((msg, idx) => {
        const preview = msg.content.slice(0, 100).replace(/\n/g, ' ');
        console.log(`\n  ${idx + 1}. [${msg.role.toUpperCase()}]`);
        console.log(`     ${preview}${msg.content.length > 100 ? '...' : ''}`);
        if (msg.tools_used && msg.tools_used.length > 0) {
          console.log(`     🔧 Tools: ${msg.tools_used.join(', ')}`);
        }
      });

      // Classify phase
      console.log('\n🤖 Calling gpt-5-nano...');
      const classification = await classifyPhase(client, messageWindow);

      console.log('\n🎯 CLASSIFICATION RESULT:');
      console.log(`  Phase: ${classification.phase.toUpperCase()}`);
      console.log(`  Confidence: ${(classification.confidence * 100).toFixed(1)}%`);
      console.log(`  Objective: ${classification.objective}`);
      console.log(`  Reasoning: ${classification.reasoning}`);
    }

    // Report token usage
    console.log('\n\n' + tokenTracker.report());
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
