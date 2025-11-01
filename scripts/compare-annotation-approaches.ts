#!/usr/bin/env ts-node
/**
 * Compare Annotation Approaches
 *
 * Runs both Option A (single-pass) and Option C (two-pass contextual)
 * and displays side-by-side comparison
 *
 * Usage:
 *   npx ts-node scripts/compare-annotation-approaches.ts <session.jsonl>
 */

import * as path from 'path';
import { OpenAIClient } from '../src/ai/client';
import {
  analyzeSession,
  formatAnnotations,
} from '../src/analyzer/user-message-annotator';
import {
  analyzeSessionContextual,
  formatContextualAnnotations,
} from '../src/analyzer/contextual-annotator';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('❌ Error: No session file provided\n');
    console.log('Usage:');
    console.log('  npx ts-node scripts/compare-annotation-approaches.ts <session.jsonl>\n');
    console.log('Example:');
    console.log(
      '  npx ts-node scripts/compare-annotation-approaches.ts examples/blog-post-generator-transcript.jsonl'
    );
    process.exit(1);
  }

  const sessionPath = path.resolve(args[0]);

  console.log('🔬 COMPARING ANNOTATION APPROACHES');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Session: ${sessionPath}`);
  console.log('');

  try {
    // Run Option A (single-pass)
    console.log('▶️  Running Option A (Single-Pass)...');
    console.log('');
    const clientA = new OpenAIClient();
    const resultA = await analyzeSession(clientA, { sessionPath });
    const usageA = clientA.getTokenTracker().getStats();

    console.log(formatAnnotations(resultA));

    // Run Option C (two-pass contextual)
    console.log('\n▶️  Running Option C (Two-Pass Contextual)...');
    console.log('');
    const clientC = new OpenAIClient();
    const resultC = await analyzeSessionContextual(clientC, { sessionPath });
    const usageC = clientC.getTokenTracker().getStats();

    console.log(formatContextualAnnotations(resultC));

    // Side-by-side comparison
    console.log('═══════════════════════════════════════════════════');
    console.log('  COMPARISON: Option A vs Option C');
    console.log('═══════════════════════════════════════════════════');
    console.log('');

    // Color distribution
    console.log('🎨 COLOR DISTRIBUTION:');
    console.log('');
    console.log('                  Option A    Option C');
    console.log('                  --------    --------');
    console.log(
      `🟢 Green (new):        ${resultA.stats.greenCount.toString().padStart(2)}          ${resultC.stats.greenCount.toString().padStart(2)}`
    );
    console.log(
      `🟡 Yellow (steer):     ${resultA.stats.yellowCount.toString().padStart(2)}          ${resultC.stats.yellowCount.toString().padStart(2)}`
    );
    console.log(
      `🔴 Red (restart):      ${resultA.stats.redCount.toString().padStart(2)}          ${resultC.stats.redCount.toString().padStart(2)}`
    );
    console.log('');

    // Cost comparison
    const totalCostA = Object.values(usageA).reduce(
      (sum: number, stat: any) => sum + stat.totalCost,
      0
    );
    const totalCostC = Object.values(usageC).reduce(
      (sum: number, stat: any) => sum + stat.totalCost,
      0
    );

    console.log('💰 COST COMPARISON:');
    console.log('');
    console.log(`Option A: $${totalCostA.toFixed(6)} (${Object.values(usageA).reduce((sum: number, stat: any) => sum + stat.calls, 0)} API calls)`);
    console.log(
      `Option C: $${totalCostC.toFixed(6)} (${resultC.stats.totalApiCalls} API calls)`
    );
    console.log(
      `Difference: $${(totalCostC - totalCostA).toFixed(6)} (${((totalCostC / totalCostA - 1) * 100).toFixed(1)}% more)`
    );
    console.log('');

    // Annotation differences
    console.log('📊 ANNOTATION DIFFERENCES:');
    console.log('');

    const differences: Array<{
      msgIndex: number;
      optionA: string;
      optionC: string;
      different: boolean;
    }> = [];

    resultA.annotations.annotations.forEach((annA) => {
      const annC = resultC.annotations.find(
        (a) => a.messageIndex === annA.messageIndex
      );
      if (annC) {
        differences.push({
          msgIndex: annA.messageIndex,
          optionA: annA.color,
          optionC: annC.color,
          different: annA.color !== annC.color,
        });
      }
    });

    const diffCount = differences.filter((d) => d.different).length;
    console.log(`   ${diffCount} out of ${differences.length} messages have different colors`);
    console.log('');

    if (diffCount > 0) {
      console.log('   Differences:');
      differences
        .filter((d) => d.different)
        .forEach((d) => {
          const annotationA = resultA.annotations.annotations.find(
            (a) => a.messageIndex === d.msgIndex
          );
          const annotationC = resultC.annotations.find(
            (a) => a.messageIndex === d.msgIndex
          );
          console.log(`   Message #${d.msgIndex}:`);
          console.log(`      Option A: ${d.optionA} - ${annotationA?.annotation}`);
          console.log(
            `      Option C: ${d.optionC} - ${annotationC?.annotation}`
          );
          if (annotationC?.reasoning) {
            console.log(`      Reasoning: ${annotationC.reasoning}`);
          }
          console.log('');
        });
    } else {
      console.log('   ✅ Both approaches produced identical color classifications!');
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('');
    console.log('✅ Comparison complete!');
    console.log('');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
