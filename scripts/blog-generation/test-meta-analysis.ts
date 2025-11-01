#!/usr/bin/env ts-node
/**
 * Test Meta-Analysis Prompt with gpt-5-nano
 *
 * Loads example session, builds digest, runs meta-analysis, shows results
 */

import * as fs from 'fs';
import * as path from 'path';
import { OpenAIClient, TokenTracker } from '../src/ai/client';
import { createSessionDigest } from '../src/analyzer/digest-builder';
import { metaAnalyze } from '../src/prompts/meta-analysis';
import { BLOG_TEMPLATES } from '../src/types/templates';

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
  console.log('🚀 Testing Meta-Analysis with gpt-5-nano');
  console.log('='.repeat(80));
  console.log(`Session file: ${EXAMPLE_SESSION}\n`);

  // Load session
  const messages = loadSession(EXAMPLE_SESSION);
  console.log(`Loaded ${messages.length} messages\n`);

  // Create digest
  console.log('📊 Building session digest...');
  const digest = createSessionDigest(messages);

  console.log('\n✅ Digest created:');
  console.log(`  - Opening: "${digest.session_opening.initial_request.slice(0, 80)}..."`);
  console.log(`  - Total messages: ${digest.session_stats.total_messages}`);
  console.log(`  - Duration: ~${digest.session_stats.duration_estimate_minutes} min`);
  console.log(`  - Tools used: ${digest.tool_summary.length} different tools`);
  console.log(`  - Files created: ${digest.files_created.length}`);
  console.log(`  - Files modified: ${digest.files_modified.length}`);
  console.log(`  - Decision points: ${digest.decision_points.length}`);

  console.log('\n🔧 Top tools:');
  digest.tool_summary.slice(0, 5).forEach((t) => {
    console.log(`  - ${t.tool_name}: ${t.count}x`);
  });

  // Initialize OpenAI client
  const tokenTracker = new TokenTracker();
  const client = new OpenAIClient(tokenTracker);

  console.log('\n🤖 Calling gpt-5-nano for meta-analysis...\n');

  try {
    const meta = await metaAnalyze(client, digest);

    // Display results
    console.log('='.repeat(80));
    console.log('🎯 META-ANALYSIS RESULTS');
    console.log('='.repeat(80));

    console.log('\n📌 USER GOAL');
    console.log(`Primary: ${meta.user_goal.primary_objective}`);
    if (meta.user_goal.secondary_objectives) {
      console.log('Secondary:');
      meta.user_goal.secondary_objectives.forEach((obj) =>
        console.log(`  - ${obj}`)
      );
    }

    console.log('\n📝 RECOMMENDED TEMPLATE');
    console.log(`Template: ${meta.recommended_template.toUpperCase()}`);
    const templateInfo = BLOG_TEMPLATES[meta.recommended_template];
    console.log(`Name: ${templateInfo.name}`);
    console.log(`Reasoning: ${meta.template_reasoning}`);

    console.log('\n📚 SUGGESTED PHASES');
    meta.suggested_phases.forEach((phase, i) => {
      console.log(`\n${i + 1}. ${phase.name}`);
      console.log(`   Messages: ${phase.message_range[0]}-${phase.message_range[1]}`);
      console.log(`   Activity: ${phase.primary_activity}`);
      console.log(`   Why distinct: ${phase.why_distinct}`);
    });

    console.log('\n✨ NARRATIVE ELEMENTS');
    console.log('\nOpening hook:');
    console.log(`"${meta.narrative_elements.opening_hook}"`);

    console.log('\nKey turning points:');
    meta.narrative_elements.key_turning_points.forEach((point) =>
      console.log(`  - ${point}`)
    );

    console.log('\nLessons learned themes:');
    meta.narrative_elements.lessons_learned_themes.forEach((theme) =>
      console.log(`  - ${theme}`)
    );

    console.log('\n📰 SUGGESTED TITLES');
    meta.suggested_titles.forEach((title, i) => {
      console.log(`${i + 1}. ${title}`);
    });

    console.log('\n📋 SESSION NOTES');
    console.log(`Session type: ${meta.notes.session_type}`);
    console.log(`Collaboration detected: ${meta.notes.collaboration_detected}`);
    console.log(`Cost consciousness: ${meta.notes.cost_consciousness}`);
    console.log('\nNotable patterns:');
    meta.notes.notable_patterns.forEach((pattern) =>
      console.log(`  - ${pattern}`)
    );

    // Show token usage
    console.log('\n' + tokenTracker.report());

    // Estimate for full 149-message session
    const stats = tokenTracker.getStats('meta-analysis');
    if (stats.totalCost) {
      console.log('💰 COST ANALYSIS');
      console.log('='.repeat(80));
      console.log(`Meta-analysis cost: $${stats.totalCost.toFixed(6)}`);
      console.log(
        `For 30 phase classifications @ $0.00003 each: $${(30 * 0.00003).toFixed(6)}`
      );
      console.log(
        `Total estimated session cost: $${(stats.totalCost + 30 * 0.00003).toFixed(6)}`
      );
      console.log(
        `Target: $0.01 per session (${stats.totalCost < 0.01 ? '✅ Under budget!' : '❌ Over budget'})`
      );
    }
  } catch (error) {
    console.error('\n❌ Error during meta-analysis:', error);
    if (error instanceof Error) {
      console.error(error.message);
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
