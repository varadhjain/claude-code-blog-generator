/**
 * Test 1: JSONL Parsing (no API calls)
 * Verifies we can parse the session file and extract messages
 */

import { readFile } from 'fs/promises';
import * as path from 'path';

interface JsonlEntry {
  type: string;
  message?: {
    role: string;
    content: string | any[];
  };
  timestamp?: string;
  participant?: string;
  text?: string;
}

async function parseConversation(filePath: string): Promise<JsonlEntry[]> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n').filter((l: string) => l.trim());

  const entries: JsonlEntry[] = [];

  for (const line of lines) {
    try {
      const entry: JsonlEntry = JSON.parse(line);
      entries.push(entry);
    } catch (err) {
      continue;
    }
  }

  return entries;
}

async function testParsing() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 TEST 1: JSONL Parsing');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const sessionPath = path.join(__dirname, 'examples/blog-post-generator-transcript.jsonl');

  try {
    const entries = await parseConversation(sessionPath);

    // Count message types
    const userMessages = entries.filter(e => e.type === 'user');
    const assistantMessages = entries.filter(e => e.type === 'assistant');
    const toolUses = entries.filter(e => e.type === 'tool_use');
    const toolResults = entries.filter(e => e.type === 'tool_result');
    const otherEntries = entries.filter(e => !['user', 'assistant', 'tool_use', 'tool_result'].includes(e.type));

    console.log('✓ Successfully parsed session file');
    console.log(`  Total entries: ${entries.length}`);
    console.log(`  User messages: ${userMessages.length}`);
    console.log(`  Assistant messages: ${assistantMessages.length}`);
    console.log(`  Tool uses: ${toolUses.length}`);
    console.log(`  Tool results: ${toolResults.length}`);
    console.log(`  Other entries: ${otherEntries.length}`);

    // Show first user message as example
    if (userMessages.length > 0) {
      const firstUser = userMessages[0];
      const messageContent = firstUser.message?.content;
      if (typeof messageContent === 'string') {
        const preview = messageContent.substring(0, 100).replace(/\n/g, ' ');
        console.log(`\n  First user message: "${preview}..."`);
      }
    }

    console.log('\n✅ PASS: JSONL parsing works correctly\n');
    return true;
  } catch (error) {
    console.error('\n❌ FAIL: JSONL parsing failed');
    console.error(error);
    return false;
  }
}

testParsing().then(success => {
  process.exit(success ? 0 : 1);
});
