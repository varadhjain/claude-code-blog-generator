#!/usr/bin/env ts-node
/**
 * Test Full Extraction Workflow
 *
 * 1. Create session index
 * 2. Run meta-analysis
 * 3. Extract real code artifacts
 * 4. Show side-by-side: LLM narrative vs actual code
 */

import * as fs from 'fs';
import * as path from 'path';
import { OpenAIClient, TokenTracker } from '../src/ai/client';
import { createSessionIndex, indexToText } from '../src/analyzer/session-indexer';
import { metaAnalyze } from '../src/prompts/meta-analysis';
import { createSessionDigest } from '../src/analyzer/digest-builder';
import {
  extractCodeForPhases,
  selectInterestingArtifacts,
} from '../src/analyzer/code-extractor';

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

async function main() {
  console.log('🚀 Testing Full Extraction Workflow');
  console.log('='.repeat(80));
  console.log(`Session file: ${EXAMPLE_SESSION}\n`);

  // Load session
  const messages = loadSession(EXAMPLE_SESSION);
  console.log(`Loaded ${messages.length} messages\n`);

  // Step 1: Create session index
  console.log('📇 Step 1: Creating session index...');
  const index = createSessionIndex(messages, 50);

  console.log(`\n✅ Index created with ${index.chunks.length} chunks:`);
  console.log(indexToText(index).split('\n').slice(0, 25).join('\n'));
  console.log('  ... (truncated for display)\n');

  // Step 2: Run meta-analysis (using digest for short session, but showing both approaches)
  console.log('🤖 Step 2: Running meta-analysis...');

  const tokenTracker = new TokenTracker();
  const client = new OpenAIClient(tokenTracker);

  // For demo: use digest approach (faster for this session size)
  const digest = createSessionDigest(messages);
  const meta = await metaAnalyze(client, digest);

  console.log('\n✅ Meta-analysis complete\n');
  console.log('📌 User Goal:', meta.user_goal.primary_objective);
  console.log('📝 Template:', meta.recommended_template);
  console.log(`📚 Phases identified: ${meta.suggested_phases.length}\n`);

  meta.suggested_phases.forEach((phase, i) => {
    console.log(
      `  ${i + 1}. ${phase.name} (messages ${phase.message_range[0]}-${phase.message_range[1]})`
    );
  });

  // Step 3: Extract code artifacts
  console.log('\n🔍 Step 3: Extracting real code artifacts...\n');

  const extractions = extractCodeForPhases(messages, meta, {
    maxCodeLength: 500,
    maxArtifactsPerSection: 5,
    includeTypes: ['code', 'error', 'command'],
  });

  console.log(`✅ Extracted artifacts from ${extractions.length} phases:\n`);

  extractions.forEach((extraction, i) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`PHASE ${i + 1}: ${extraction.section_name}`);
    console.log('='.repeat(80));

    extraction.artifacts.forEach((artifact, j) => {
      console.log(`\n  Artifact ${j + 1} [${artifact.type.toUpperCase()}]`);
      console.log(`  Source: Message ${artifact.source_message}`);
      console.log(`  Context: ${artifact.context}`);

      if (artifact.file_path) {
        console.log(`  File: ${artifact.file_path}`);
      }

      console.log('\n  Content:');
      const lines = artifact.content.split('\n');
      const preview = lines.slice(0, 10).join('\n');
      console.log('  ' + preview.replace(/\n/g, '\n  '));

      if (lines.length > 10) {
        console.log(`  ... (${lines.length - 10} more lines)`);
      }
    });
  });

  // Step 4: Select most interesting artifacts
  console.log('\n\n' + '='.repeat(80));
  console.log('🌟 MOST INTERESTING ARTIFACTS');
  console.log('='.repeat(80));

  const interesting = selectInterestingArtifacts(extractions, 5);

  interesting.forEach((artifact, i) => {
    console.log(`\n${i + 1}. [${artifact.type.toUpperCase()}] ${artifact.context}`);
    console.log(`   Message ${artifact.source_message}`);

    if (artifact.file_path) {
      console.log(`   File: ${artifact.file_path}`);
    }

    const preview = artifact.content.split('\n').slice(0, 5).join('\n');
    console.log('\n   ' + preview.replace(/\n/g, '\n   '));
  });

  // Step 5: Show token usage
  console.log('\n\n' + tokenTracker.report());

  // Summary
  console.log('💡 SUMMARY');
  console.log('='.repeat(80));
  console.log(
    `✅ Meta-analysis identified ${meta.suggested_phases.length} phases`
  );
  console.log(`✅ Extracted ${extractions.reduce((sum, e) => sum + e.artifacts.length, 0)} total artifacts`);
  console.log(`✅ Selected ${interesting.length} most interesting for blog post`);
  console.log(
    `✅ Blog post will include: LLM narrative + ${interesting.length} real code snippets`
  );
  console.log(
    '\n🎯 Wilhelm can verify: Each code snippet links back to source message!'
  );
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  if (error instanceof Error) {
    console.error(error.stack);
  }
  process.exit(1);
});
