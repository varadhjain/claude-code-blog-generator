#!/usr/bin/env npx ts-node

/**
 * Quick test of blog summary generation
 */

import { analyzeSession } from './src/user-annotations';
import { generateBlogSummary } from './src/blog-summary/generator';
import { OpenAIClient } from './src/ai/client';
import * as fs from 'fs/promises';

async function test() {
  const exampleSession = './examples/blog-post-generator-transcript.jsonl';

  console.log('Testing blog summary generation...\n');

  // Check if file exists
  try {
    await fs.access(exampleSession);
  } catch {
    console.error(`Example session not found: ${exampleSession}`);
    process.exit(1);
  }

  console.log('1. Analyzing session...');
  const client = new OpenAIClient();
  const annotations = await analyzeSession(client, {
    sessionPath: exampleSession,
    contextWindow: 3
  });

  console.log(`✅ Analysis complete!`);
  console.log(`   🟢 ${annotations.stats.greenCount} new tasks`);
  console.log(`   🟡 ${annotations.stats.yellowCount} clarifications`);
  console.log(`   🔴 ${annotations.stats.redCount} pivots`);
  console.log(`   📋 ${annotations.phases.phases.length} phases detected\n`);

  // Parse the JSONL to get messages
  console.log('2. Parsing messages...');
  const lines = (await fs.readFile(exampleSession, 'utf-8')).trim().split('\n');
  const entries = lines.map((line, idx) => {
    try {
      const parsed = JSON.parse(line);
      return { ...parsed, index: idx };
    } catch (e) {
      console.warn(`Warning: Could not parse line ${idx + 1}`);
      return null;
    }
  }).filter((e): e is NonNullable<typeof e> => e !== null);

  const messages = entries.map((entry, index) => ({
    type: entry.type,
    message: entry.message,
    timestamp: entry.timestamp,
    index
  }));

  console.log(`✅ Parsed ${messages.length} messages\n`);

  // Generate blog summary
  console.log('3. Generating blog summary...');
  const summary = await generateBlogSummary(
    messages,
    annotations,
    {
      sessionId: 'test-session',
      sessionTitle: 'Blog Post Generator Development',
      messagesPerPage: 50,
      maxPromptsPerPhase: 5,
      maxCodePerPhase: 2
    }
  );

  console.log(`✅ Blog summary generated!\n`);

  // Write outputs
  console.log('4. Writing outputs...');
  await fs.writeFile('./SUMMARY.md', summary.markdown, 'utf-8');
  await fs.writeFile('./summary.html', summary.html, 'utf-8');

  console.log(`✅ Files written:`);
  console.log(`   📝 SUMMARY.md (${summary.markdown.length} chars)`);
  console.log(`   🌐 summary.html (${summary.html.length} chars)\n`);

  console.log('🎉 Test complete! Check SUMMARY.md and summary.html\n');
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
