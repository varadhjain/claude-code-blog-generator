#!/usr/bin/env ts-node
/**
 * CLI Script: Annotate User Messages
 *
 * Usage:
 *   npx ts-node scripts/annotate-user-messages.ts <session.jsonl> [output.json]
 *
 * Example:
 *   npx ts-node scripts/annotate-user-messages.ts examples/blog-post-generator-transcript.jsonl
 */

import * as path from 'path';
import { OpenAIClient } from '../src/ai/client';
import {
  analyzeSession,
  formatAnnotations,
} from '../src/analyzer/user-message-annotator';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('❌ Error: No session file provided\n');
    console.log('Usage:');
    console.log('  npx ts-node scripts/annotate-user-messages.ts <session.jsonl> [output.json]\n');
    console.log('Example:');
    console.log('  npx ts-node scripts/annotate-user-messages.ts examples/blog-post-generator-transcript.jsonl');
    console.log('  npx ts-node scripts/annotate-user-messages.ts examples/session.jsonl output/annotations.json');
    process.exit(1);
  }

  const sessionPath = path.resolve(args[0]);
  const outputPath = args[1] ? path.resolve(args[1]) : undefined;

  console.log('🔍 Analyzing user messages...');
  console.log(`   Session: ${sessionPath}`);
  if (outputPath) {
    console.log(`   Output: ${outputPath}`);
  }
  console.log('');

  try {
    // Initialize OpenAI client
    const client = new OpenAIClient();

    // Analyze session
    const result = await analyzeSession(client, {
      sessionPath,
      outputPath,
    });

    // Display formatted results
    console.log(formatAnnotations(result));

    // Show token usage report
    console.log(client.getTokenTracker().report());

    // Success message
    console.log('✅ Analysis complete!\n');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
