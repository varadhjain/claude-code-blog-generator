/**
 * Test 2b: OpenAI API Model Availability
 * Test different models to diagnose which ones work
 */

import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

async function testModel(client: OpenAI, modelName: string): Promise<boolean> {
  try {
    console.log(`  Testing ${modelName}...`);
    const start = Date.now();

    const response = await client.chat.completions.create({
      model: modelName,
      messages: [
        { role: 'user', content: 'Say "ok"' }
      ],
      max_completion_tokens: 5
    });

    const duration = Date.now() - start;
    console.log(`  ✓ ${modelName} works (${duration}ms, ${response.usage?.total_tokens} tokens)\n`);
    return true;
  } catch (error: any) {
    console.log(`  ✗ ${modelName} failed: ${error.message}\n`);
    return false;
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 2b: Model Availability Check');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not found\n');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey, timeout: 15000 });

  console.log('Testing different OpenAI models:\n');

  // Test models in order of likelihood to exist
  const modelsToTest = [
    'gpt-4o-mini',        // Known to exist (latest cheap model)
    'gpt-4o',             // Known to exist
    'gpt-5-nano',         // What we want to use
    'gpt-4.1-nano',       // Alternative from web search
  ];

  const results = [];
  for (const model of modelsToTest) {
    const works = await testModel(client, model);
    results.push({ model, works });
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('RESULTS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  results.forEach(r => {
    console.log(`  ${r.works ? '✓' : '✗'} ${r.model}`);
  });

  const anyWorked = results.some(r => r.works);
  const gpt5NanoWorks = results.find(r => r.model === 'gpt-5-nano')?.works;

  console.log('');
  if (gpt5NanoWorks) {
    console.log('✅ gpt-5-nano is available and working!\n');
  } else if (anyWorked) {
    console.log('⚠️  gpt-5-nano is not available, but other models work');
    console.log('   Consider using an alternative model\n');
  } else {
    console.log('❌ No models worked - likely a network or auth issue\n');
  }

  process.exit(gpt5NanoWorks ? 0 : 1);
}

main();
