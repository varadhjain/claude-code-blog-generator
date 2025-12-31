/**
 * Test 2: OpenAI API Connection (simple diagnostic)
 * Verifies API key is valid and basic connection works
 */

import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

async function testAPIConnection() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 2: OpenAI API Connection (Diagnostic)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Check if API key exists
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not found in .env file');
    }

    console.log('✓ API key found in environment');
    console.log(`  Key starts with: ${apiKey.substring(0, 10)}...`);
    console.log(`  Key length: ${apiKey.length} characters\n`);

    console.log('Testing basic OpenAI client initialization...');
    const client = new OpenAI({ apiKey, timeout: 10000 }); // 10 second timeout
    console.log('✓ Client initialized\n');

    console.log('Testing API call with gpt-5-nano...');
    console.log('(Timeout set to 10 seconds)\n');

    const start = Date.now();
    const response = await client.chat.completions.create({
      model: 'gpt-5-nano',
      messages: [
        { role: 'system', content: 'You are a helpful assistant. Respond with JSON only.' },
        { role: 'user', content: 'Reply with a JSON object: {"status": "ok"}' }
      ],
      max_completion_tokens: 20,
      response_format: { type: 'json_object' }
    });
    const duration = Date.now() - start;

    console.log(`✓ API call successful in ${duration}ms`);
    console.log(`  Model: ${response.model}`);
    console.log(`  Response: ${response.choices[0]?.message?.content}`);
    console.log(`  Usage: ${response.usage?.total_tokens} tokens`);

    console.log('\n✅ PASS: OpenAI API connection works\n');
    return true;
  } catch (error: any) {
    console.error('\n❌ FAIL: OpenAI API connection failed\n');
    console.error(`  Error name: ${error.name || 'Unknown'}`);
    console.error(`  Error message: ${error.message}`);
    console.error(`  Error code: ${error.code || 'N/A'}`);
    console.error(`  Error status: ${error.status || 'N/A'}`);

    if (error.stack) {
      console.error(`\n  Stack trace (first 3 lines):`);
      const stackLines = error.stack.split('\n').slice(0, 3);
      stackLines.forEach((line: string) => console.error(`  ${line}`));
    }

    console.error('\n  Diagnostic hints:');
    if (error.message?.includes('OPENAI_API_KEY')) {
      console.error('  → Create a .env file with your OpenAI API key');
      console.error('  → Get your key from: https://platform.openai.com/api-keys');
    } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      console.error('  → API call timed out - check your network connection');
      console.error('  → Try again in a moment');
    } else if (error.status === 404 || error.message?.includes('model_not_found')) {
      console.error('  → Model gpt-5-nano may not be available yet');
      console.error('  → Check available models at: https://platform.openai.com/docs/models');
    } else if (error.status === 401 || error.message?.includes('auth')) {
      console.error('  → API key is invalid or expired');
      console.error('  → Check your .env file');
    } else if (error.message?.includes('ENOTFOUND') || error.message?.includes('ECONNREFUSED')) {
      console.error('  → Cannot reach OpenAI servers');
      console.error('  → Check your internet connection');
    }

    console.error('');
    return false;
  }
}

testAPIConnection().then(success => {
  process.exit(success ? 0 : 1);
});
