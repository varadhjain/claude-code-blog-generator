#!/usr/bin/env ts-node
/**
 * Interactive Sidebar Generator with TUI
 *
 * User-driven workflow:
 * 1. Select session file
 * 2. Choose story angle
 * 3. Generate sidebar with all narrative elements
 * 4. Auto-open result
 */

import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { select, input, confirm } from '@inquirer/prompts';
import { OpenAIClient, TokenTracker } from '../src/ai/client';
import { createSessionDigest } from '../src/analyzer/digest-builder';
import {
  UserIntent,
  SessionAngle,
  ANGLE_DESCRIPTIONS,
  suggestAngle,
  getFocusAreas
} from '../src/prompts/user-intent';
import { analyzeUserPatterns } from '../src/prompts/user-patterns';
import { extractHighlights } from '../src/prompts/highlights-extraction';
import { brainstormTitles } from '../src/prompts/title-brainstorm';
import { extractLearnings } from '../src/prompts/structured-learning';
import { extractProblems } from '../src/prompts/problem-extraction';
import { buildApproachNarrative } from '../src/prompts/approach-narrative';
import { generateBlogOutline } from '../src/prompts/blog-outline';

const OUTPUT_DIR = path.join(__dirname, '../output');

// Load session
function loadSession(filepath: string): any[] {
  const lines = fs.readFileSync(filepath, 'utf-8').split('\n');
  return lines
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
    .filter((msg) => msg.type === 'user' || msg.type === 'assistant');
}

// Extract user messages
function extractUserMessages(messages: any[]): string[] {
  return messages
    .filter((m) => m.type === 'user')
    .map((m) => {
      if (typeof m.content === 'string') return m.content;
      if (Array.isArray(m.content)) {
        return m.content
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('\n');
      }
      return '';
    })
    .filter((text) => text.length > 0);
}

// Auto-open file
function autoOpenFile(filepath: string): void {
  const platform = process.platform;
  let command: string;

  if (platform === 'darwin') {
    command = `open "${filepath}"`;
  } else if (platform === 'win32') {
    command = `start "${filepath}"`;
  } else {
    command = `xdg-open "${filepath}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.log(`\n⚠️  Could not auto-open file: ${error.message}`);
      console.log(`   Please open manually: ${filepath}`);
    }
  });
}

// Format sidebar as markdown
function formatSidebar(data: any): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Session: ${data.title || 'Untitled'}`);
  lines.push(`**${data.duration} • ${data.messages} messages • ${data.userPatterns.archetype}**\n`);
  lines.push('---\n');

  // What Happened
  lines.push('## 📍 What Happened\n');
  lines.push(data.highlights.one_liner + '\n');

  // Key Phases
  lines.push('## 🔄 Key Phases\n');
  data.approach.named_phases.forEach((phase: any, i: number) => {
    lines.push(`${i + 1}. **${phase.name}** (msgs ${phase.message_range[0]}-${phase.message_range[1]})`);
    lines.push(`   ${phase.description}\n`);
  });

  // Highlights
  lines.push('## ✨ Highlights\n');
  data.highlights.highlights.forEach((h: any, i: number) => {
    lines.push(`### ${i + 1}. ${h.title}`);
    lines.push(h.what);
    lines.push(`**Why notable**: ${h.why_notable}\n`);
  });

  // Problems (if any)
  if (data.problems.problems.length > 0) {
    lines.push('## ⚠️ Problems\n');
    data.problems.problems.forEach((p: any, i: number) => {
      lines.push(`### ${i + 1}. ${p.title}`);
      lines.push(`**Symptom**: ${p.symptom}`);
      if (p.resolution) {
        lines.push(`**Resolution**: ${p.resolution}`);
      }
      lines.push('');
    });
  }

  // Learnings
  lines.push('## 💡 Learnings\n');
  lines.push(`**Primary lesson**: ${data.learnings.primary_lesson}\n`);
  data.learnings.learnings.slice(0, 5).forEach((l: any, i: number) => {
    lines.push(`${i + 1}. ${l.insight}`);
    lines.push(`   (${l.category}, confidence: ${l.confidence})\n`);
  });

  // Titles
  lines.push('## 📝 Potential Titles\n');
  data.titles.titles.forEach((t: any, i: number) => {
    lines.push(`${i + 1}. "${t.title}"`);
    lines.push(`   ${t.appeal}\n`);
  });

  // Blog Outline
  lines.push('## 📖 Blog Outline\n');
  lines.push(`**Hook**: ${data.outline.hook}\n`);
  lines.push('**Sections**:');
  data.outline.sections.forEach((s: any, i: number) => {
    lines.push(`${i + 1}. ${s.heading}`);
    if (s.subsections && s.subsections.length > 0) {
      s.subsections.forEach((sub: string) => lines.push(`   - ${sub}`));
    }
    lines.push('');
  });
  lines.push(`**Estimated length**: ${data.outline.estimated_word_count} words\n`);

  return lines.join('\n');
}

async function main() {
  console.log('🎯 Interactive Sidebar Generator');
  console.log('='.repeat(80));
  console.log('User-driven blog post workflow\n');

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Step 1: Select session file
  const sessionPath = await input({
    message: 'Path to session file (or press Enter for example):',
    default: path.join(__dirname, '../examples/blog-post-generator-transcript.jsonl'),
  });

  if (!fs.existsSync(sessionPath)) {
    console.error(`❌ Session file not found: ${sessionPath}`);
    process.exit(1);
  }

  console.log('\n📂 Loading session...');
  const messages = loadSession(sessionPath);
  const userMessages = extractUserMessages(messages);
  console.log(`✅ Loaded ${messages.length} messages (${userMessages.length} from user)\n`);

  // Step 2: Build digest and suggest angle
  console.log('📊 Analyzing session...');
  const digest = createSessionDigest(messages);
  const suggestedAngle = suggestAngle(digest);
  console.log(`💡 Suggested angle: ${suggestedAngle}\n`);

  // Step 3: Ask user for story angle
  const angleChoices = (Object.keys(ANGLE_DESCRIPTIONS) as SessionAngle[]).map((angle) => ({
    name: `${angle === suggestedAngle ? '⭐ ' : ''}${ANGLE_DESCRIPTIONS[angle]}`,
    value: angle,
  }));

  const chosenAngle = await select({
    message: 'What story do you want to tell?',
    choices: angleChoices,
  });

  let customDescription: string | undefined;
  if (chosenAngle === 'custom') {
    customDescription = await input({
      message: 'Describe your angle:',
    });
  }

  const targetAudience = await input({
    message: 'Who is this for? (e.g., "developers learning Claude Code")',
    default: 'developers interested in AI-assisted coding',
  });

  // Build user intent
  const userIntent: UserIntent = {
    angle: chosenAngle,
    custom_description: customDescription,
    focus_areas: getFocusAreas(chosenAngle, digest),
    target_audience: targetAudience,
  };

  console.log('\n🔨 Generating sidebar...');
  console.log('   This will take 30-60 seconds...\n');

  // Initialize AI client
  const tokenTracker = new TokenTracker();
  const client = new OpenAIClient(tokenTracker);

  // Run all extractions
  console.log('   • Analyzing user patterns...');
  const userPatterns = await analyzeUserPatterns(client, digest, userMessages);

  console.log('   • Extracting highlights...');
  const highlights = await extractHighlights(client, digest, userIntent);

  console.log('   • Building approach narrative...');
  const approach = await buildApproachNarrative(client, digest);

  console.log('   • Identifying problems...');
  const problems = await extractProblems(client, digest);

  console.log('   • Extracting learnings...');
  const learnings = await extractLearnings(client, digest);

  console.log('   • Brainstorming titles...');
  const titleOptions = await brainstormTitles(
    client,
    digest.session_opening.initial_request,
    highlights.highlights.map((h) => ({
      title: h.title,
      description: h.what,
      why_interesting: h.why_notable,
      message_range: h.message_range,
    })),
    customDescription
  );

  console.log('   • Generating blog outline...');
  const outline = await generateBlogOutline(
    client,
    digest,
    userIntent,
    highlights,
    titleOptions.titles.map((t) => t.title)
  );

  console.log('\n✅ Sidebar complete!\n');

  // Format and save
  const sidebarData = {
    title: titleOptions.titles[0]?.title || 'Untitled Session',
    duration: `${digest.session_stats.duration_estimate_minutes} min`,
    messages: digest.session_stats.total_messages,
    userPatterns,
    highlights,
    approach,
    problems,
    learnings,
    titles: titleOptions,
    outline,
  };

  const markdown = formatSidebar(sidebarData);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputFilename = `sidebar-${timestamp}.md`;
  const outputPath = path.join(OUTPUT_DIR, outputFilename);
  fs.writeFileSync(outputPath, markdown);

  console.log(`📝 Saved to: ${outputPath}\n`);

  // Summary
  console.log('='.repeat(80));
  console.log('📊 Summary\n');
  console.log(`Angle: ${chosenAngle}`);
  console.log(`User archetype: ${userPatterns.archetype}`);
  console.log(`Highlights: ${highlights.highlights.length}`);
  console.log(`Problems: ${problems.problems.length}`);
  console.log(`Learnings: ${learnings.learnings.length}`);
  console.log(`Titles: ${titleOptions.titles.length}`);
  console.log(`Outline sections: ${outline.sections.length}\n`);

  // Token usage
  console.log(tokenTracker.report());

  // Auto-open
  const shouldOpen = await confirm({
    message: 'Open the generated sidebar?',
    default: true,
  });

  if (shouldOpen) {
    autoOpenFile(outputPath);
  }
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  if (error instanceof Error) {
    console.error(error.stack);
  }
  process.exit(1);
});
