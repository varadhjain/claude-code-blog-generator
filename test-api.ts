/**
 * Test 2: OpenAI API Connection (minimal call)
 * Verifies API key is valid and gpt-5-nano is accessible
 */

import { OpenAIClient } from './src/ai/client';
import * as dotenv from 'dotenv';

dotenv.config();

async function testAPIConnection() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 2: OpenAI API Connection');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Check if API key exists
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not found in .env file');
    }

    console.log('✓ API key found in environment');
    console.log('  Testing connection with minimal API call...\n');

    const client = new OpenAIClient();

    // Make a very simple API call to test connection and model availability
    const response = await client.callStructured<{ message: string }>(
      'test-connection',
      'You are a helpful assistant. Respond with JSON only.',
      'Reply with a JSON object containing a single "message" field with the value "connection successful"',
      {
        maxTokens: 50,
        responseFormat: 'json_object'
      }
    );

    console.log('✓ Successfully connected to OpenAI API');
    console.log(`✓ Model gpt-5-nano is accessible`);
    console.log(`  Response: ${JSON.stringify(response)}`);

    // Check token usage
    const tracker = client.getTokenTracker();
    const stats = tracker.getStats('test-connection');

    console.log(`\n  Token usage:`);
    console.log(`    Prompt tokens: ${stats.promptTokens}`);
    console.log(`    Completion tokens: ${stats.completionTokens}`);
    console.log(`    Total tokens: ${stats.totalTokens}`);
    console.log(`    Cost: $${stats.totalCost.toFixed(6)}`);

    console.log('\n✅ PASS: OpenAI API connection works\n');
    return true;
  } catch (error: any) {
    console.error('\n❌ FAIL: OpenAI API connection failed');
    console.error(`  Error: ${error.message}\n`);

    if (error.message?.includes('OPENAI_API_KEY')) {
      console.error('  Hint: Create a .env file with your OpenAI API key');
      console.error('  Get your key from: https://platform.openai.com/api-keys\n');
    } else if (error.message?.includes('model')) {
      console.error('  Hint: Check if gpt-5-nano is available for your account');
      console.error('  Visit: https://platform.openai.com/docs/models\n');
    } else if (error.message?.includes('network') || error.message?.includes('connect')) {
      console.error('  Hint: Check your internet connection\n');
    }

    return false;
  }
}

testAPIConnection().then(success => {
  process.exit(success ? 0 : 1);
});
