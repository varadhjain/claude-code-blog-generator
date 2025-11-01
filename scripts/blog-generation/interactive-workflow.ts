#!/usr/bin/env ts-node
/**
 * Interactive Workflow Test
 *
 * Tests the complete sidebar generation workflow:
 * 1. Extract facts from session
 * 2. Build complete sidebar (approach, problems, successes, learnings, etc.)
 * 3. Save formatted sidebar as markdown
 * 4. Auto-open the generated file
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { OpenAIClient, TokenTracker } from '../src/ai/client';
import { createSessionDigest } from '../src/analyzer/digest-builder';
import { buildSidebar, formatSidebarMarkdown } from '../src/analyzer/sidebar-builder';

const OUTPUT_DIR = path.join(__dirname, '../output');

// Load session
function loadSession(filepath: string): any[] {
  const lines = fs.readFileSync(filepath, 'utf-8').split('\n');
  return lines
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
    .filter((msg) => msg.type === 'user' || msg.type === 'assistant');
}

// Auto-open file based on platform
function autoOpenFile(filepath: string): void {
  const platform = process.platform;
  let command: string;

  if (platform === 'darwin') {
    command = `open "${filepath}"`;
  } else if (platform === 'win32') {
    command = `start "${filepath}"`;
  } else {
    command = `xdg-open "${filepath}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.log(`\n⚠️  Could not auto-open file: ${error.message}`);
      console.log(`   Please open manually: ${filepath}`);
    } else {
      console.log(`\n✅ Opened ${filepath}`);
    }
  });
}

async function main() {
  const args = process.argv.slice(2);
  const sessionPath = args[0] || path.join(__dirname, '../examples/blog-post-generator-transcript.jsonl');

  console.log('🎯 Blog Post Sidebar Generator');
  console.log('='.repeat(80));
  console.log(`Analyzing: ${path.basename(sessionPath)}\n`);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load session
  console.log('📂 Loading session...');
  if (!fs.existsSync(sessionPath)) {
    console.error(`❌ Session file not found: ${sessionPath}`);
    process.exit(1);
  }
  const messages = loadSession(sessionPath);
  console.log(`✅ Loaded ${messages.length} messages\n`);

  // Initialize AI client
  const tokenTracker = new TokenTracker();
  const client = new OpenAIClient(tokenTracker);

  // Step 1: Extract facts
  console.log('📊 Building session digest...');
  const digest = createSessionDigest(messages);
  console.log(`✅ Session: ${digest.session_stats.total_messages} messages, ~${digest.session_stats.duration_estimate_minutes} minutes\n`);

  // Step 2: Build complete sidebar
  console.log('🔨 Building complete sidebar...');
  console.log('   Extracting: Approach, Problems, Successes, Learnings, Moments, Titles');
  const sidebar = await buildSidebar(client, digest);
  console.log('✅ Sidebar complete\n');

  // Step 3: Format as markdown
  console.log('📝 Formatting as markdown...');
  const markdown = formatSidebarMarkdown(sidebar);

  // Step 4: Save to file
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputFilename = `sidebar-${timestamp}.md`;
  const outputPath = path.join(OUTPUT_DIR, outputFilename);
  fs.writeFileSync(outputPath, markdown);
  console.log(`✅ Saved to: ${outputPath}\n`);

  // Summary
  console.log('='.repeat(80));
  console.log('📊 Sidebar Summary\n');
  console.log(`Approach: ${sidebar.approach.key_characteristics.join(', ')}`);
  console.log(`Problems: ${sidebar.problems_encountered.problems.length} identified`);
  console.log(`Successes: ${sidebar.what_went_well.successes.length} identified`);
  console.log(`Learnings: ${sidebar.learnings.learnings.length} extracted`);
  console.log(`Interesting moments: ${sidebar.interesting_moments.moments.length}`);
  console.log(`Potential titles: ${sidebar.potential_titles.titles.length}\n`);

  // Token usage
  console.log(tokenTracker.report());

  // Auto-open the generated file
  autoOpenFile(outputPath);
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  if (error instanceof Error) {
    console.error(error.stack);
  }
  process.exit(1);
});
