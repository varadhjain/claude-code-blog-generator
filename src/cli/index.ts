#!/usr/bin/env node

/**
 * Interactive CLI for Claude Code Blog Generator
 * Makes it dead simple for anyone to generate blog summaries from their sessions
 */

import { select, input, confirm } from '@inquirer/prompts';
import * as fs from 'fs/promises';
import * as path from 'path';
import { analyzeSession } from '../user-annotations';
import { generateAnnotatedHTML, type SessionMessage } from '../annotated-viewer/generator';
import { generateBlogSummary } from '../blog-summary/generator';
import { uploadHTMLToGist } from '../gist-uploader';
import { OpenAIClient } from '../ai/client';

// ============================================================================
// SESSION DISCOVERY
// ============================================================================

interface ClaudeSession {
  id: string;
  path: string;
  project: string;
  size: number;
  modified: Date;
  messageCount: number;
  firstMessage?: string;
}

/**
 * Find all Claude Code session files in ~/.claude/projects/
 */
async function discoverSessions(): Promise<ClaudeSession[]> {
  const claudeDir = path.join(process.env.HOME!, '.claude', 'projects');

  try {
    const projectDirs = await fs.readdir(claudeDir);
    const sessions: ClaudeSession[] = [];

    for (const projectDir of projectDirs) {
      const projectPath = path.join(claudeDir, projectDir);
      const stat = await fs.stat(projectPath);

      if (!stat.isDirectory()) continue;

      // Find .jsonl files in this project
      const files = await fs.readdir(projectPath);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));

      for (const file of jsonlFiles) {
        const sessionPath = path.join(projectPath, file);
        const sessionStat = await fs.stat(sessionPath);

        // Quick count messages
        const content = await fs.readFile(sessionPath, 'utf-8');
        const lines = content.trim().split('\n');
        const messageCount = lines.length;

        // Extract first user message for preview
        let firstMessage: string | undefined;
        for (const line of lines.slice(0, 10)) {
          try {
            const entry = JSON.parse(line);
            if (entry.message?.role === 'user' && entry.message?.content) {
              const text = typeof entry.message.content === 'string'
                ? entry.message.content
                : entry.message.content.find((c: any) => c.type === 'text')?.text || '';
              firstMessage = text.substring(0, 100);
              break;
            }
          } catch (e) {
            // Skip invalid lines
          }
        }

        sessions.push({
          id: file.replace('.jsonl', ''),
          path: sessionPath,
          project: projectDir.split('/').pop()!,
          size: sessionStat.size,
          modified: sessionStat.mtime,
          messageCount,
          firstMessage
        });
      }
    }

    // Sort by most recent first
    return sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime());
  } catch (error) {
    console.error('❌ Error discovering sessions:', error);
    return [];
  }
}

/**
 * Format session for display in selector
 */
function formatSessionChoice(session: ClaudeSession): string {
  const date = session.modified.toLocaleDateString();
  const time = session.modified.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const preview = session.firstMessage
    ? `"${session.firstMessage.trim().substring(0, 60)}..."`
    : 'No preview';

  return `[${date} ${time}] ${session.messageCount} msgs - ${preview}`;
}

// ============================================================================
// ANALYSIS WORKFLOW
// ============================================================================

async function runAnalysis(sessionPath: string, sessionTitle?: string): Promise<void> {
  console.log('\n🚀 Starting analysis...\n');

  // Parse JSONL
  console.log('📖 Parsing session file...');
  const lines = (await fs.readFile(sessionPath, 'utf-8')).trim().split('\n');
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
  console.log('🤖 Analyzing session with AI...');
  const client = new OpenAIClient();
  const annotations = await analyzeSession(client, {
    sessionPath,
    contextWindow: 3
  });

  console.log(`✅ Analysis complete!`);
  console.log(`   🟢 ${annotations.stats.greenCount} new tasks`);
  console.log(`   🟡 ${annotations.stats.yellowCount} clarifications`);
  console.log(`   🔴 ${annotations.stats.redCount} pivots`);
  console.log(`   📋 ${annotations.phases.phases.length} phases detected\n`);

  // Generate HTML viewer
  console.log('🎨 Generating annotated HTML viewer...');
  const htmlOutput = await generateAnnotatedHTML(
    messages,
    annotations,
    {
      sessionTitle: sessionTitle || 'Claude Code Session',
      messagesPerPage: 50
    }
  );

  console.log(`✅ HTML generated (${htmlOutput.pages.length} pages)\n`);

  // Generate blog summary
  console.log('📝 Generating blog summary...');
  const blogSummary = await generateBlogSummary(
    messages,
    annotations,
    {
      sessionId: path.basename(sessionPath, '.jsonl'),
      sessionTitle: sessionTitle || 'Claude Code Session',
      messagesPerPage: 50,
      maxPromptsPerPhase: 5,
      maxCodePerPhase: 2
    }
  );

  console.log(`✅ Blog summary generated!\n`);

  // Upload to Gist
  const shouldUpload = await confirm({
    message: 'Upload to GitHub Gist?',
    default: true
  });

  if (shouldUpload) {
    console.log('☁️  Uploading to GitHub Gist...');
    const files = [
      { filename: 'index.html', content: htmlOutput.summary },
      ...htmlOutput.pages.map(page => ({
        filename: page.filename,
        content: page.content
      })),
      { filename: 'SUMMARY.md', content: blogSummary.markdown },
      { filename: 'summary.html', content: blogSummary.html }
    ];

    const result = await uploadHTMLToGist(files, sessionTitle || 'claude-code-session');

    console.log(`\n✅ Success!`);
    console.log(`\n🔗 Gist URL: ${result.url}`);
    console.log(`👁️  Preview: ${result.previewUrl}`);
    console.log(`\n📝 The Gist includes:`);
    console.log(`   • SUMMARY.md - Quick overview blog post`);
    console.log(`   • summary.html - Formatted blog summary`);
    console.log(`   • index.html - Full annotated session viewer`);
    console.log(`   • Deep links from summary to key moments\n`);
  } else {
    // Save locally
    const outputDir = path.join(process.cwd(), 'output');
    await fs.mkdir(outputDir, { recursive: true });

    await fs.writeFile(path.join(outputDir, 'index.html'), htmlOutput.summary);
    for (const page of htmlOutput.pages) {
      await fs.writeFile(path.join(outputDir, page.filename), page.content);
    }
    await fs.writeFile(path.join(outputDir, 'SUMMARY.md'), blogSummary.markdown);
    await fs.writeFile(path.join(outputDir, 'summary.html'), blogSummary.html);

    console.log(`\n✅ Saved to ${outputDir}/\n`);
  }
}

// ============================================================================
// MAIN CLI
// ============================================================================

async function main() {
  console.clear();
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║    🚀 Claude Code Blog Generator                         ║');
  console.log('║                                                           ║');
  console.log('║    Transform your Claude sessions into shareable         ║');
  console.log('║    blog posts with AI-powered annotations                ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ Error: OPENAI_API_KEY not found in environment');
    console.error('\nPlease set your OpenAI API key:');
    console.error('  export OPENAI_API_KEY=sk-proj-...\n');
    console.error('Or create a .env file with:');
    console.error('  OPENAI_API_KEY=sk-proj-...\n');
    process.exit(1);
  }

  // Discover sessions
  console.log('🔍 Discovering Claude Code sessions...\n');
  const sessions = await discoverSessions();

  if (sessions.length === 0) {
    console.error('❌ No Claude Code sessions found in ~/.claude/projects/\n');
    console.error('Make sure you have some Claude Code sessions saved.\n');
    process.exit(1);
  }

  console.log(`Found ${sessions.length} sessions\n`);

  // Let user choose session
  const choices = sessions.map(s => ({
    name: formatSessionChoice(s),
    value: s.path,
    description: `Project: ${s.project}`
  }));

  choices.push({
    name: '📁 Use custom path...',
    value: 'custom',
    description: 'Specify a custom .jsonl file path'
  });

  const sessionPath = await select({
    message: 'Select a session to analyze:',
    choices,
    pageSize: 10
  });

  let finalPath = sessionPath;
  if (sessionPath === 'custom') {
    finalPath = await input({
      message: 'Enter path to .jsonl session file:',
      validate: async (p) => {
        try {
          await fs.access(p);
          return true;
        } catch {
          return 'File not found';
        }
      }
    });
  }

  // Get session title
  const sessionTitle = await input({
    message: 'Session title (optional):',
    default: 'Claude Code Session'
  });

  // Run analysis
  await runAnalysis(finalPath, sessionTitle);
}

// Run CLI
main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
