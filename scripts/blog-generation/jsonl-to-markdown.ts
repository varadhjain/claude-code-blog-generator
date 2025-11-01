#!/usr/bin/env ts-node
/**
 * Convert JSONL session to simplified markdown format
 *
 * This reduces token usage by:
 * - Removing unnecessary fields (uuids, timestamps, etc.)
 * - Truncating long tool outputs
 * - Summarizing file snapshots
 * - Using readable markdown format
 */

import * as fs from 'fs';

interface ConversionOptions {
  maxToolOutputLength?: number;
  maxTextLength?: number;
  includeTimestamps?: boolean;
  includeFileSnapshots?: boolean;
}

function convertJsonlToMarkdown(
  jsonlPath: string,
  options: ConversionOptions = {}
): string {
  const {
    maxToolOutputLength = 500,
    maxTextLength = 1000,
    includeTimestamps = false,
    includeFileSnapshots = false,
  } = options;

  const lines = fs.readFileSync(jsonlPath, 'utf-8').split('\n');
  const messages = lines
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

  const output: string[] = [];
  output.push('# Claude Code Session Transcript\n');

  let messageNum = 0;

  for (const msg of messages) {
    // Skip file snapshots unless requested
    if (msg.type === 'file-history-snapshot' && !includeFileSnapshots) {
      continue;
    }

    // Skip system messages
    if (msg.type === 'system') {
      continue;
    }

    messageNum++;

    if (msg.type === 'user') {
      output.push(`---\n## Message ${messageNum}: USER\n`);
      if (includeTimestamps && msg.timestamp) {
        output.push(`_Time: ${msg.timestamp}_\n`);
      }

      const content = msg.message?.content;
      if (typeof content === 'string') {
        const truncated =
          content.length > maxTextLength
            ? content.slice(0, maxTextLength) + '...[truncated]'
            : content;
        output.push(truncated + '\n');
      } else if (Array.isArray(content)) {
        // Handle tool results in user messages
        for (const block of content) {
          if (block.type === 'tool_result') {
            output.push(`\n**Tool Result** (${block.tool_use_id}):\n`);
            const resultContent =
              typeof block.content === 'string'
                ? block.content
                : JSON.stringify(block.content);
            const truncated =
              resultContent.length > maxToolOutputLength
                ? resultContent.slice(0, maxToolOutputLength) + '...[truncated]'
                : resultContent;
            output.push('```\n' + truncated + '\n```\n');
            if (block.is_error) {
              output.push('_[This was an error]_\n');
            }
          }
        }
      }
    } else if (msg.type === 'assistant') {
      output.push(`---\n## Message ${messageNum}: ASSISTANT\n`);
      if (includeTimestamps && msg.timestamp) {
        output.push(`_Time: ${msg.timestamp}_\n`);
      }

      const content = msg.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            const truncated =
              block.text.length > maxTextLength
                ? block.text.slice(0, maxTextLength) + '...[truncated]'
                : block.text;
            output.push(truncated + '\n');
          } else if (block.type === 'tool_use') {
            output.push(`\n**🔧 Tool: ${block.name}**\n`);
            output.push(`_ID: ${block.id}_\n`);
            if (block.input) {
              output.push('```json\n');
              output.push(JSON.stringify(block.input, null, 2) + '\n');
              output.push('```\n');
            }
          }
        }
      }
    } else if (msg.type === 'file-history-snapshot' && includeFileSnapshots) {
      output.push(`---\n## Snapshot ${messageNum}\n`);
      output.push(
        `Files tracked: ${Object.keys(msg.snapshot?.trackedFileBackups || {}).length}\n`
      );
    }
  }

  return output.join('\n');
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: ts-node jsonl-to-markdown.ts <session.jsonl> [output.md]');
    console.log('\nOptions:');
    console.log('  --max-tool-output <length>  Max length of tool outputs (default: 500)');
    console.log('  --max-text <length>         Max length of text content (default: 1000)');
    console.log('  --timestamps                Include timestamps');
    console.log('  --file-snapshots            Include file snapshots');
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1] || inputPath.replace('.jsonl', '.md');

  const options: ConversionOptions = {
    maxToolOutputLength: 500,
    maxTextLength: 1000,
    includeTimestamps: args.includes('--timestamps'),
    includeFileSnapshots: args.includes('--file-snapshots'),
  };

  // Parse option values
  const maxToolIdx = args.indexOf('--max-tool-output');
  if (maxToolIdx !== -1 && args[maxToolIdx + 1]) {
    options.maxToolOutputLength = parseInt(args[maxToolIdx + 1]);
  }

  const maxTextIdx = args.indexOf('--max-text');
  if (maxTextIdx !== -1 && args[maxTextIdx + 1]) {
    options.maxTextLength = parseInt(args[maxTextIdx + 1]);
  }

  console.log(`Converting ${inputPath} to ${outputPath}...`);
  const markdown = convertJsonlToMarkdown(inputPath, options);
  fs.writeFileSync(outputPath, markdown);
  console.log(`✅ Done! Wrote ${markdown.length} characters to ${outputPath}`);

  // Show token estimate
  const estimatedTokens = Math.ceil(markdown.length / 4); // rough estimate
  console.log(`📊 Estimated tokens: ~${estimatedTokens.toLocaleString()}`);
}

export { convertJsonlToMarkdown };
