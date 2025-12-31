#!/usr/bin/env bun

/**
 * End-to-end test script for ccblog
 * Tests the complete workflow: parse → analyze → generate HTML → upload gist
 */

import { analyzeSession } from './src/user-annotations';
import { generateAnnotatedHTML, type SessionMessage } from './src/annotated-viewer/generator';
import { uploadHTMLToGist } from './src/gist-uploader';
import { OpenAIClient } from './src/ai/client';
import { readFile } from 'fs/promises';

interface JsonlEntry {
  type: string;
  message?: {
    role: string;
    content: string | any[];
  };
  timestamp?: string;
}

async function parseConversation(filePath: string): Promise<JsonlEntry[]> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n').filter((l: string) => l.trim());

  const entries: JsonlEntry[] = [];

  for (const line of lines) {
    try {
      const entry: JsonlEntry = JSON.parse(line);
      if (['user', 'assistant', 'system'].includes(entry.type)) {
        entries.push(entry);
      }
    } catch (err) {
      continue;
    }
  }

  return entries;
}

async function main() {
  const sessionPath = 'examples/blog-post-generator-transcript.jsonl';
  const sessionId = 'blog-post-generator-transcript';

  console.log('\n🧪 Running E2E Test for ccblog\n');
  console.log('━'.repeat(60));

  // Step 1: Parse session
  console.log('\n📁 Step 1: Parsing session...');
  const entries = await parseConversation(sessionPath);
  console.log(`✅ Found ${entries.length} messages`);

  // Step 2: Analyze with gpt-5-nano
  console.log('\n🧠 Step 2: Analyzing session with gpt-5-nano...');
  try {
    const client = new OpenAIClient();
    const annotations = await analyzeSession(client, {
      sessionPath,
      contextWindow: 3
    });

    console.log('✅ Analysis complete!');
    console.log(`   🟢 ${annotations.stats.greenCount} new tasks`);
    console.log(`   🟡 ${annotations.stats.yellowCount} clarifications`);
    console.log(`   🔴 ${annotations.stats.redCount} pivots`);
    console.log(`   📋 ${annotations.phases.phases.length} phases detected`);

    // Step 3: Generate HTML
    console.log('\n📄 Step 3: Generating annotated HTML...');
    const messages: SessionMessage[] = entries.map((entry, index) => ({
      type: entry.type,
      message: entry.message,
      timestamp: entry.timestamp,
      index
    }));

    const htmlOutput = await generateAnnotatedHTML(
      messages,
      annotations,
      {
        sessionTitle: 'Blog Post Generator Development Session',
        messagesPerPage: 50
      }
    );

    console.log(`✅ HTML generated!`);
    console.log(`   📊 ${htmlOutput.pages.length} pages created`);

    // Step 4: Upload to Gist
    console.log('\n☁️  Step 4: Uploading to Gist...');
    const files = [
      { filename: 'index.html', content: htmlOutput.summary },
      ...htmlOutput.pages.map(page => ({
        filename: page.filename,
        content: page.content
      }))
    ];

    const result = await uploadHTMLToGist(files, sessionId);

    console.log('\n✅ E2E Test Complete!');
    console.log('\n━'.repeat(60));
    console.log('\n📊 Results:');
    console.log(`   Messages analyzed: ${entries.length}`);
    console.log(`   Annotations: 🟢 ${annotations.stats.greenCount} 🟡 ${annotations.stats.yellowCount} 🔴 ${annotations.stats.redCount}`);
    console.log(`   Phases: ${annotations.phases.phases.length}`);
    console.log(`   HTML pages: ${htmlOutput.pages.length}`);
    console.log(`\n🔗 Gist URL: ${result.url}`);
    console.log(`👁️  Preview: ${result.previewUrl}`);
    console.log('\n━'.repeat(60));
    console.log('\n💡 Open the preview URL to see the annotated session!\n');

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error('\n📜 Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
