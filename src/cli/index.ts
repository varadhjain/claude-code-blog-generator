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
import { extractGoal, extractOutcome } from '../blog-summary/extractor';
import { uploadHTMLToGist } from '../gist-uploader';
import { OpenAIClient } from '../ai/client';
import { redactFiles } from '../redactor';
import { extractFromSession } from '../extractor';
import { runSetupWizard, quickSetupCheck } from './setup-wizard';

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

interface AnalysisOptions {
  sessionTitle?: string;
  auto?: boolean;
  redact?: boolean;
  quiet?: boolean;
}

async function runAnalysis(sessionPath: string, options: AnalysisOptions = {}): Promise<void> {
  const { sessionTitle, auto, redact, quiet } = options;
  const log = quiet ? (..._args: any[]) => {} : console.log;
  log('\n🚀 Starting analysis...\n');

  // Parse JSONL
  log('📖 Parsing session file...');
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

  // Extract model from first assistant entry that carries one
  const rawModel = entries.find(e => e.type === 'assistant' && e.message?.model)?.message?.model as string | undefined;

  log(`✅ Parsed ${messages.length} messages\n`);

  // Analyze
  log('🤖 Analyzing session with AI...');
  const client = new OpenAIClient();
  const annotations = await analyzeSession(client, {
    sessionPath,
    contextWindow: 3
  });

  log(`✅ Analysis complete!`);
  log(`   🟢 ${annotations.stats.greenCount} new tasks`);
  log(`   🟡 ${annotations.stats.yellowCount} clarifications`);
  log(`   🔴 ${annotations.stats.redCount} pivots`);
  log(`   📋 ${annotations.phases.phases.length} phases detected\n`);

  // Extract heuristic goal and outcome (no AI cost)
  const goalResult = extractGoal(messages, annotations);
  const outcomeResult = extractOutcome(messages, annotations);

  // Generate HTML viewer
  log('🎨 Generating annotated HTML viewer...');
  const htmlOutput = await generateAnnotatedHTML(
    messages,
    annotations,
    {
      sessionTitle: sessionTitle || 'Claude Code Session',
      messagesPerPage: 50,
      goal: goalResult.text,
      outcome: outcomeResult.text,
      model: rawModel
    }
  );

  log(`✅ HTML generated (${htmlOutput.pages.length} pages)\n`);

  // Generate blog summary
  log('📝 Generating blog summary...');
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

  log(`✅ Blog summary generated!\n`);

  // Build file map
  let fileMap = new Map<string, string>();
  fileMap.set('index.html', htmlOutput.summary);
  for (const page of htmlOutput.pages) {
    fileMap.set(page.filename, page.content);
  }
  fileMap.set('SUMMARY.md', blogSummary.markdown);
  fileMap.set('summary.html', blogSummary.html);

  // PII redaction
  if (redact) {
    log('🔒 Running PII redaction...');
    const redactionResult = redactFiles(fileMap);
    fileMap = redactionResult.files;
    log(`   ${redactionResult.summary}\n`);
  }

  // Auto mode: save to ~/.ccblog/drafts/ and exit
  if (auto) {
    const draftsDir = path.join(process.env.HOME!, '.ccblog', 'drafts');
    await fs.mkdir(draftsDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const draftDir = path.join(draftsDir, timestamp);
    await fs.mkdir(draftDir, { recursive: true });

    for (const [filename, content] of fileMap) {
      await fs.writeFile(path.join(draftDir, filename), content);
    }
    if (!quiet) console.log(`✅ Draft saved to ${draftDir}`);
    return;
  }

  // Interactive: ask where to save
  const shouldUpload = await confirm({
    message: 'Upload to GitHub Gist?',
    default: true
  });

  if (shouldUpload) {
    // Auto-redact when publishing (if not already done)
    if (!redact) {
      const redactionResult = redactFiles(fileMap);
      if (redactionResult.totalRedactions > 0) {
        log(`⚠️  ${redactionResult.summary}`);
        const proceed = await confirm({
          message: 'Sensitive content detected. Redact before uploading?',
          default: true
        });
        if (proceed) {
          fileMap = redactionResult.files;
        }
      }
    }

    log('☁️  Uploading to GitHub Gist...');
    const files = Array.from(fileMap.entries()).map(([filename, content]) => ({ filename, content }));
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

    for (const [filename, content] of fileMap) {
      await fs.writeFile(path.join(outputDir, filename), content);
    }

    console.log(`\n✅ Saved to ${outputDir}/\n`);
  }
}

// ============================================================================
// MAIN CLI
// ============================================================================

async function main() {
  // Check for --setup flag
  const args = process.argv.slice(2);
  if (args.includes('--setup') || args.includes('-s')) {
    const result = await runSetupWizard();
    if (!result.success) {
      process.exit(1);
    }
    // If setup succeeded and user wants to continue, proceed to main flow
    // Otherwise exit
    return;
  }

  // Separate flags from positional args
  const flags = args.filter(a => a.startsWith('--') || a.startsWith('-'));
  const positional = args.filter(a => !a.startsWith('--') && !a.startsWith('-'));
  const subcommand = positional[0]; // 'extract', 'serve', or undefined

  // Check for 'serve' subcommand — start MCP server
  if (subcommand === 'serve') {
    const { startServer } = await import('../mcp-server');
    await startServer();
    return;
  }

  // Search subcommands — BM25 full-text over ~/.claude/projects. Zero network.
  if (subcommand === 'search') {
    const { openDb } = await import('../search/db');
    const { searchSessions } = await import('../search/query');
    const query = positional.slice(1).join(' ');
    if (!query) {
      console.error('Usage: ccblog search <query> [--limit N]');
      process.exit(1);
    }
    const limitIdx = flags.indexOf('--limit');
    const limit = limitIdx >= 0 ? Number(args[args.indexOf('--limit') + 1]) : 10;
    const db = openDb();
    const hits = searchSessions(db, query, limit);
    if (hits.length === 0) { console.log('no matches — run `ccblog index` first?'); return; }
    for (const h of hits) {
      const date = h.last_msg_at ? new Date(h.last_msg_at).toISOString().slice(0, 16).replace('T', ' ') : '—';
      console.log(`\n[${h.score.toFixed(2)}] ${h.project}  ${date}  msg#${h.best_msg_index}`);
      console.log(`  ${h.session_id}`);
      if (h.first_user_prompt) console.log(`  ↳ ${h.first_user_prompt.replace(/\s+/g, ' ').slice(0, 100)}`);
      console.log(`  "${h.snippet.replace(/\s+/g, ' ').slice(0, 200)}"`);
    }
    return;
  }

  if (subcommand === 'index') {
    const { openDb } = await import('../search/db');
    const { indexAll } = await import('../search/indexer');
    const db = openDb();
    const t0 = Date.now();
    const stats = indexAll(db);
    console.log(`indexed ${stats.messagesIndexed} new messages from ${stats.filesChanged}/${stats.filesScanned} files (${(stats.bytesIngested / 1e6).toFixed(1)} MB) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    return;
  }

  if (subcommand === 'watch') {
    const { openDb } = await import('../search/db');
    const { indexAll, indexFile, DEFAULT_SESSIONS_ROOT } = await import('../search/indexer');
    const chokidar = (await import('chokidar')).default;
    const db = openDb();
    const t0 = Date.now();
    const stats = indexAll(db);
    console.log(`initial: ${stats.messagesIndexed} msgs from ${stats.filesChanged}/${stats.filesScanned} files in ${((Date.now() - t0) / 1000).toFixed(1)}s. watching…`);
    const pending = new Map<string, NodeJS.Timeout>();
    const schedule = (file: string) => {
      const existing = pending.get(file);
      if (existing) clearTimeout(existing);
      pending.set(file, setTimeout(() => {
        pending.delete(file);
        try {
          const r = indexFile(db, file);
          if (r.messagesIndexed > 0) console.log(`+${r.messagesIndexed} msg  ${file.split('/').slice(-2).join('/')}`);
        } catch (e) {
          console.error(`indexFile failed: ${e instanceof Error ? e.message : e}`);
        }
      }, 400));
    };
    const watcher = chokidar.watch(`${DEFAULT_SESSIONS_ROOT}/**/*.jsonl`, { ignoreInitial: true, awaitWriteFinish: false });
    watcher.on('add', schedule);
    watcher.on('change', schedule);
    process.on('SIGINT', () => { watcher.close(); process.exit(0); });
    return;
  }

  if (subcommand === 'files') {
    const { openDb } = await import('../search/db');
    const { listSessionsByFile } = await import('../search/query');
    const filePath = positional.slice(1).join(' ');
    if (!filePath) { console.error('Usage: ccblog files <path>'); process.exit(1); }
    const db = openDb();
    const rows = listSessionsByFile(db, filePath, 20);
    for (const r of rows) {
      const date = r.last_msg_at ? new Date(r.last_msg_at).toISOString().slice(0, 16).replace('T', ' ') : '—';
      console.log(`${date}  ${r.project.padEnd(40)}  ${r.session_id}`);
      if (r.first_user_prompt) console.log(`  ↳ ${r.first_user_prompt.replace(/\s+/g, ' ').slice(0, 100)}`);
    }
    return;
  }

  if (subcommand === 'sessions') {
    // Renamed from bare `recent` to avoid confusion with the existing
    // learnings-oriented list_recent MCP tool.
    const { openDb } = await import('../search/db');
    const { listRecent } = await import('../search/query');
    const db = openDb();
    const rows = listRecent(db, 20);
    for (const r of rows) {
      const date = r.last_msg_at ? new Date(r.last_msg_at).toISOString().slice(0, 16).replace('T', ' ') : '—';
      console.log(`${date}  ${r.project.padEnd(40)}  ${r.msg_count.toString().padStart(5)} msgs  ${r.session_id}`);
      if (r.first_user_prompt) console.log(`  ↳ ${r.first_user_prompt.replace(/\s+/g, ' ').slice(0, 100)}`);
    }
    return;
  }

  if (subcommand === 'reflect') {
    const { runReflect, parseSince } = await import('../reflect');
    const sinceFlag = (() => { const i = args.indexOf('--since'); return i >= 0 ? args[i + 1] : '7d'; })();
    const projectFlag = (() => { const i = args.indexOf('--project'); return i >= 0 ? args[i + 1] : undefined; })();
    const toneFlag = (() => {
      const i = args.indexOf('--tone');
      const v = i >= 0 ? args[i + 1] : 'honest';
      return (['gentle', 'honest', 'sharp'] as const).includes(v as any) ? v : 'honest';
    })() as 'gentle' | 'honest' | 'sharp';
    const dryRun = flags.includes('--dry-run');

    let sinceMs: number;
    try { sinceMs = parseSince(sinceFlag); }
    catch (e) { console.error((e as Error).message); process.exit(1); }

    if (!dryRun) {
      const { ready } = await quickSetupCheck();
      if (!ready) {
        console.error('❌ Reflection needs an API key. Run: ccblog --setup');
        process.exit(1);
      }
    }

    console.log(`🪞 Reflecting on the last ${sinceFlag}${projectFlag ? ` (project: ${projectFlag})` : ''}…`);
    const result = await runReflect({ sinceMs, project: projectFlag, tone: toneFlag, dryRun });

    if (result.digest.sessions.length === 0) {
      console.log('   No sessions found in window. (Did you run `ccblog index` recently?)');
      return;
    }

    if (dryRun) {
      console.error(`\n--- digest only (no LLM call) — ${result.digest.total_sessions} sessions, ${result.digest.total_messages} msgs ---`);
      return;
    }

    console.log(`✅ Saved: ${result.artifactPath}`);
    console.log(`   ${result.digest.total_sessions} sessions analyzed, tone=${toneFlag}`);
    return;
  }

  // Check for 'extract' subcommand
  if (subcommand === 'review') {
    const { runReview } = await import('./review-tui');
    await runReview({ all: flags.includes('--all') });
    return;
  }

  if (subcommand === 'status') {
    const { pendingReviewCount } = await import('./review-tui');
    const n = await pendingReviewCount();
    if (flags.includes('--quiet') || flags.includes('--count')) {
      // Shell-prompt-friendly: just the number on stdout, nothing else.
      process.stdout.write(`${n}\n`);
    } else if (n === 0) {
      console.log('✅ No drafts pending review.');
    } else {
      console.log(`📝 ${n} draft learning(s) pending — run \`ccblog review\``);
    }
    return;
  }

  if (subcommand === 'extract') {
    const sessionPath = positional[1]; // file path, if provided
    if (!sessionPath) {
      // No path given — extract from most recent session
      const sessions = await discoverSessions();
      if (sessions.length === 0) {
        console.error('❌ No sessions found. Provide a path: ccblog extract <session.jsonl>');
        process.exit(1);
      }
      const result = await extractFromSession(sessions[0].path, {
        redact: flags.includes('--redact'),
        quiet: flags.includes('--quiet'),
      });
      console.log(`\n📚 ${result.learnings.length} learnings extracted from ${result.episodesFound} episodes`);
      return;
    }
    const result = await extractFromSession(sessionPath, {
      redact: flags.includes('--redact'),
      quiet: flags.includes('--quiet'),
    });
    console.log(`\n📚 ${result.learnings.length} learnings extracted from ${result.episodesFound} episodes`);
    return;
  }

  // Check for --help flag
  if (args.includes('--help') || args.includes('-h')) {
    console.log('ccblog — Claude Code session toolkit: search, extract, generate\n');
    console.log('Commands:');
    console.log('  ccblog              Interactive session → blog post');
    console.log('  ccblog search <q>   BM25 full-text search over all past sessions (no API key needed)');
    console.log('  ccblog index        Build/update the local search index (Claude Code + Codex)');
    console.log('  ccblog watch        Live-tail index: initial build + auto-update on JSONL append');
    console.log('  ccblog files <p>    List every session that touched a file path');
    console.log('  ccblog sessions     List the 20 most recent sessions');
    console.log('  ccblog extract      Extract learnings from latest session (or: ccblog extract <path>)');
    console.log('  ccblog reflect      Weekly retrospective: digest last 7 days + LLM review');
    console.log('                       (--since 14d, --project name, --tone gentle|honest|sharp, --dry-run)');
    console.log('  ccblog review       Triage extracted learnings before they\'re eligible for sharing');
    console.log('  ccblog status       Show count of drafts pending review (--count for plain int)');
    console.log('  ccblog serve        Start MCP server (search + learnings, for other agents)\n');
    console.log('Privacy model:');
    console.log('  Local features (search, MCP, blog gen) ALWAYS use every learning.');
    console.log('  `ccblog review` only governs what\'s eligible to leave this machine.\n');
    console.log('Flags:');
    console.log('  --auto              Auto-analyze latest session + extract learnings');
    console.log('  --redact            PII redaction (API keys, emails, paths)');
    console.log('  --quiet             Suppress output (for hooks)');
    console.log('  --setup             Run setup wizard');
    console.log('  --help              Show this help\n');
    console.log('Agent hook (auto-capture after every session):');
    console.log('  ~/.claude/settings.json:');
    console.log('  { "hooks": { "PostSessionStop": [{ "command": "ccblog --auto --quiet --redact" }] } }\n');
    console.log('MCP setup (let agents query past learnings):');
    console.log('  ~/.claude/settings.json:');
    console.log('  { "mcpServers": { "ccblog": { "command": "ccblog", "args": ["serve"] } } }\n');
    console.log('https://github.com/varadhjain/claude-code-blog-generator\n');
    return;
  }

  const autoMode = args.includes('--auto');
  const redactMode = args.includes('--redact');
  const quietMode = args.includes('--quiet');

  // Auto mode: analyze most recent session, save draft, exit
  // Redaction is ON by default in auto mode (security: hook runs unattended)
  if (autoMode) {
    const autoRedact = redactMode || true; // always redact in auto mode
    const { ready } = await quickSetupCheck();
    if (!ready) {
      if (!quietMode) console.error('❌ Setup incomplete. Run: ccblog --setup');
      process.exit(1);
    }

    const sessions = await discoverSessions();
    if (sessions.length === 0) {
      if (!quietMode) console.error('❌ No sessions found');
      process.exit(1);
    }

    // Pick most recent session
    const latest = sessions[0];
    await runAnalysis(latest.path, {
      sessionTitle: `Session ${new Date().toISOString().substring(0, 10)}`,
      auto: true,
      redact: autoRedact,
      quiet: quietMode
    });

    // Also extract learnings (don't let extraction failure crash the whole run)
    try {
      if (!quietMode) console.log('\n🧠 Extracting learnings...');
      await extractFromSession(latest.path, { redact: autoRedact, quiet: quietMode });
    } catch (err) {
      if (!quietMode) console.error('⚠️  Learning extraction failed (draft was saved):', (err as Error).message);
    }

    // Notify-and-defer: hooks have no TTY so we can't open the review TUI here.
    // Always emit the nudge to stderr — it survives --quiet on stdout (auto
    // mode silences output meant for users, but pending drafts is a signal
    // that should reach the user's next interactive shell).
    try {
      const { pendingReviewCount } = await import('./review-tui');
      const n = await pendingReviewCount();
      if (n > 0) console.error(`📝 ${n} draft learning(s) pending — run \`ccblog review\``);
    } catch { /* best-effort */ }
    return;
  }

  console.clear();
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║                                                           ║');
  console.log('║    🚀 Claude Code Blog Generator                         ║');
  console.log('║                                                           ║');
  console.log('║    Transform your Claude sessions into shareable         ║');
  console.log('║    blog posts with AI-powered annotations                ║');
  console.log('║                                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Quick setup check
  const { ready, issues } = await quickSetupCheck();
  if (!ready) {
    console.error('⚠️  Setup incomplete:\n');
    issues.forEach(issue => console.error(`   • ${issue}`));
    console.error('');

    const runSetup = await confirm({
      message: 'Run setup wizard now?',
      default: true
    });

    if (runSetup) {
      console.log('');
      const result = await runSetupWizard();
      if (!result.success) {
        process.exit(1);
      }
      // Continue to main flow if setup succeeded
    } else {
      console.error('\nRun `ccblog --setup` when ready.\n');
      process.exit(1);
    }
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
  await runAnalysis(finalPath, { sessionTitle, redact: redactMode });
}

// Run CLI
main().catch(err => {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
});
