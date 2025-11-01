#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const argv = yargs(hideBin(process.argv))
  .scriptName('blog-post-generator')
  .usage('$0 <command> [options]')
  .command(
    'generate <session-id>',
    'Generate a blog post from a Claude Code session',
    (yargs) => {
      return yargs
        .positional('session-id', {
          describe: 'Claude Code session ID',
          type: 'string',
        })
        .option('mode', {
          alias: 'm',
          describe: 'Generation mode',
          choices: ['auto', 'interactive'],
          default: 'auto',
        })
        .option('output', {
          alias: 'o',
          describe: 'Output file path',
          type: 'string',
          default: './blog-post.md',
        })
        .option('template', {
          alias: 't',
          describe: 'Blog template type',
          choices: ['blog', 'thread', 'tutorial', 'postmortem'],
          default: 'blog',
        })
        .option('redact-level', {
          describe: 'PII redaction level',
          choices: ['aggressive', 'balanced', 'minimal'],
          default: 'balanced',
        })
        .option('include-metadata', {
          describe: 'Include token usage and session metadata',
          type: 'boolean',
          default: false,
        })
        .option('export-html', {
          describe: 'Export interactive HTML (for interactive mode)',
          type: 'boolean',
          default: false,
        })
        .option('interactive-pii', {
          describe: 'Review PII redactions before generating',
          type: 'boolean',
          default: false,
        })
        .option('project', {
          alias: 'p',
          describe: 'Project directory path',
          type: 'string',
        });
    },
    async (argv) => {
      console.log('🚀 Generating blog post...');
      console.log('Session ID:', argv['session-id']);
      console.log('Mode:', argv.mode);
      console.log('Output:', argv.output);
      console.log('\n⚠️  Implementation in progress...');
      console.log('See PLAN.md for full architecture and roadmap.');
    }
  )
  .command(
    'list',
    'List available Claude Code sessions for current project',
    (yargs) => {
      return yargs.option('current', {
        describe: 'Show only the current/latest session ID',
        type: 'boolean',
        default: false,
      });
    },
    async (argv) => {
      console.log('📋 Listing sessions...');
      console.log('\n⚠️  Implementation in progress...');
      console.log('See PLAN.md for full architecture and roadmap.');
    }
  )
  .demandCommand(1, 'You need at least one command')
  .help()
  .alias('help', 'h')
  .version('0.1.0')
  .alias('version', 'v')
  .epilogue(
    'For more information, visit: https://github.com/varadhjain/claude-code-blog-generator'
  )
  .parse();
