#!/usr/bin/env bun

/**
 * Analyze the current session and upload to Gist
 */

import { analyzeSession } from './src/user-annotations';
import { generateAnnotatedHTML, type SessionMessage } from './src/annotated-viewer/generator';
import { generateBlogSummary } from './src/blog-summary/generator';
import { uploadHTMLToGist } from './src/gist-uploader';
import { OpenAIClient } from './src/ai/client';
import * as fs from 'fs/promises';

const SESSION_PATH = process.env.HOME + '/.claude/projects/-Users-anekanta-Downloads-personal-software-blog-post-generator/094a0e90-f1e4-446e-8b74-6465f0e68e75.jsonl';

async function main() {
  console.log('🚀 Analyzing current session and generating blog summary...\n');

  // Parse JSONL
  console.log('1. Parsing session file...');
  const lines = (await fs.readFile(SESSION_PATH, 'utf-8')).trim().split('\n');
  const entries = lines.map((line, idx) => {
    try {
      return { ...JSON.parse(line), index: idx };
    } catch (e) {
      return null;
    }
  }).filter((e): e is NonNullable<typeof e> => e !== null);

  const messages: SessionMessage[] = entries.map((entry, index) => ({
    type: entry.type,
    message: entry.message,
    timestamp: entry.timestamp,
    index
  }));

  console.log(`✅ Parsed ${messages.length} messages\n`);

  // Analyze
  console.log('2. Analyzing session with AI...');
  const client = new OpenAIClient();
  const annotations = await analyzeSession(client, {
    sessionPath: SESSION_PATH,
    contextWindow: 3
  });

  console.log(`✅ Analysis complete!`);
  console.log(`   🟢 ${annotations.stats.greenCount} new tasks`);
  console.log(`   🟡 ${annotations.stats.yellowCount} clarifications`);
  console.log(`   🔴 ${annotations.stats.redCount} pivots`);
  console.log(`   📋 ${annotations.phases.phases.length} phases detected\n`);

  // Generate HTML viewer
  console.log('3. Generating annotated HTML viewer...');
  const htmlOutput = await generateAnnotatedHTML(
    messages,
    annotations,
    {
      sessionTitle: 'Building Blog Summary Generation Feature',
      messagesPerPage: 50
    }
  );

  console.log(`✅ HTML generated (${htmlOutput.pages.length} pages)\n`);

  // Generate blog summary
  console.log('4. Generating blog summary...');
  const blogSummary = await generateBlogSummary(
    messages,
    annotations,
    {
      sessionId: 'blog-summary-implementation',
      sessionTitle: 'Building Blog Summary Generation Feature',
      messagesPerPage: 50,
      maxPromptsPerPhase: 5,
      maxCodePerPhase: 2
    }
  );

  console.log(`✅ Blog summary generated!\n`);

  // Upload to Gist
  console.log('5. Uploading to GitHub Gist...');
  const files = [
    { filename: 'index.html', content: htmlOutput.summary },
    ...htmlOutput.pages.map(page => ({
      filename: page.filename,
      content: page.content
    })),
    { filename: 'SUMMARY.md', content: blogSummary.markdown },
    { filename: 'summary.html', content: blogSummary.html }
  ];

  const result = await uploadHTMLToGist(files, 'blog-summary-implementation-session');

  console.log(`\n✅ Success!`);
  console.log(`\n🔗 Gist URL: ${result.url}`);
  console.log(`👁️  Preview: ${result.previewUrl}`);
  console.log(`\n📝 The Gist includes:`);
  console.log(`   • SUMMARY.md - Quick overview blog post`);
  console.log(`   • summary.html - Formatted blog summary`);
  console.log(`   • index.html - Full annotated session viewer`);
  console.log(`   • Deep links from summary to key moments\n`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
