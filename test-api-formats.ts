/**
 * Test different API call formats for gpt-5-nano
 * Tests various model name formats and parameter combinations
 *
 * Created: December 30, 2025
 * Purpose: Diagnose why API calls are timing out by testing different formats
 */

import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

interface TestCase {
  name: string;
  model: string;
  params: any;
}

async function testFormat(client: OpenAI, testCase: TestCase): Promise<{ success: boolean; error?: string; duration?: number }> {
  try {
    console.log(`\n  Testing: ${testCase.name}`);
    console.log(`    Model: ${testCase.model}`);
    console.log(`    Params: ${JSON.stringify(testCase.params, null, 2).split('\n').join('\n    ')}`);

    const start = Date.now();

    const response = await client.chat.completions.create({
      model: testCase.model,
      messages: [
        { role: 'user', content: 'Say "ok"' }
      ],
      ...testCase.params
    });

    const duration = Date.now() - start;
    console.log(`    ✓ Success! (${duration}ms)`);
    console.log(`    Response: ${response.choices[0]?.message?.content}`);

    return { success: true, duration };
  } catch (error: any) {
    console.log(`    ✗ Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST: API Call Format Variations');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Date: December 30, 2025');
  console.log('Purpose: Test different model names and parameter formats\n');

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not found\n');
    process.exit(1);
  }

  // Short timeout to fail fast
  const client = new OpenAI({ apiKey, timeout: 10000 });

  // Different model name formats and parameter combinations
  const testCases: TestCase[] = [
    {
      name: 'gpt-5-nano (base name)',
      model: 'gpt-5-nano',
      params: { max_completion_tokens: 10 }
    },
    {
      name: 'gpt-5-nano with dated snapshot',
      model: 'gpt-5-nano-2025-08-07',
      params: { max_completion_tokens: 10 }
    },
    {
      name: 'gpt-5-nano with max_tokens (deprecated)',
      model: 'gpt-5-nano',
      params: { max_tokens: 10 }
    },
    {
      name: 'gpt-4o-mini (known working model)',
      model: 'gpt-4o-mini',
      params: { max_tokens: 10 }
    },
    {
      name: 'gpt-4o (known working model)',
      model: 'gpt-4o',
      params: { max_tokens: 10 }
    }
  ];

  console.log(`Running ${testCases.length} test cases...\n`);

  const results = [];
  for (const testCase of testCases) {
    const result = await testFormat(client, testCase);
    results.push({ testCase, result });
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('RESULTS SUMMARY:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let anyWorked = false;
  let gpt5NanoWorked = false;

  results.forEach(({ testCase, result }) => {
    const status = result.success ? '✓' : '✗';
    const duration = result.duration ? ` (${result.duration}ms)` : '';
    const error = result.error ? ` - ${result.error}` : '';
    console.log(`  ${status} ${testCase.name}${duration}${error}`);

    if (result.success) {
      anyWorked = true;
      if (testCase.model.startsWith('gpt-5-nano')) {
        gpt5NanoWorked = true;
      }
    }
  });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('DIAGNOSIS:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (gpt5NanoWorked) {
    console.log('✅ gpt-5-nano works! Found a working format.');
    const workingCase = results.find(r => r.testCase.model.startsWith('gpt-5-nano') && r.result.success);
    if (workingCase) {
      console.log(`\n   Use this configuration:`);
      console.log(`     Model: ${workingCase.testCase.model}`);
      console.log(`     Params: ${JSON.stringify(workingCase.testCase.params, null, 2).split('\n').join('\n     ')}`);
    }
  } else if (anyWorked) {
    console.log('⚠️  gpt-5-nano is NOT available, but other models work.');
    console.log('   This means:');
    console.log('   - Your network connection is fine');
    console.log('   - Your API key is valid');
    console.log('   - gpt-5-nano might not be available for your account yet');
    console.log('\n   Working models:');
    results
      .filter(r => r.result.success)
      .forEach(r => console.log(`     - ${r.testCase.model}`));
    console.log('\n   Consider using one of the working models as a temporary alternative.');
  } else {
    console.log('❌ NO models worked - this is a network/connectivity issue.');
    console.log('   - Check https://status.openai.com');
    console.log('   - Try: curl -I https://api.openai.com/v1/models');
    console.log('   - Check firewall/VPN settings');
  }

  console.log('');
  process.exit(gpt5NanoWorked ? 0 : 1);
}

main();
