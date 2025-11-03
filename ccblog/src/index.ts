#!/usr/bin/env node

import { readdir, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { select, confirm } from '@inquirer/prompts';
import {
  analyzeConversation,
  extractUserMessages,
  type AnnotatorResult,
} from './claude-annotations.js';

interface Project {
  name: string;
  path: string;
  sessionCount?: number;
}

interface Conversation {
  name: string;
  path: string;
  modifiedTime: Date;
  size: number;
  messageCount: number;
  summary?: string;
  firstUserMessage?: string;
}

interface ToolUse {
  type: 'tool_use';
  id: string;
  name: string;
  input: any;
}

interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string | Array<{ type: string; text?: string }>;
}

interface TextContent {
  type: 'text';
  text: string;
}

interface ThinkingContent {
  type: 'thinking';
  thinking: string;
}

type ContentBlock = TextContent | ThinkingContent | ToolUse | ToolResult;

interface JsonlEntry {
  type: string;
  summary?: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
  isMeta?: boolean;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
}

/**
 * Get all Claude Code projects from ~/.claude/projects
 */
async function getProjects(): Promise<Project[]> {
  const claudeProjectsDir = join(homedir(), '.claude', 'projects');

  try {
    const entries = await readdir(claudeProjectsDir, { withFileTypes: true });
    const projects: Project[] = [];

    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        const projectPath = join(claudeProjectsDir, entry.name);

        // Count .jsonl files
        try {
          const files = await readdir(projectPath);
          const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

          projects.push({
            name: entry.name,
            path: projectPath,
            sessionCount: jsonlFiles.length,
          });
        } catch (err) {
          // If we can't read the directory, still add it but without session count
          projects.push({
            name: entry.name,
            path: projectPath,
          });
        }
      }
    }

    // Sort by name
    return projects.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error(`Error reading Claude projects directory: ${err}`);
    return [];
  }
}

/**
 * Extract text content from message content (handles both string and array formats)
 */
function extractTextContent(
  content: string | ContentBlock[]
): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((item) => item.type === 'text')
      .map((item) => (item as TextContent).text)
      .join('\n');
  }
  return '';
}

/**
 * Parse a JSONL file to extract summary, first user message, and message count
 */
async function parseConversationMetadata(filePath: string): Promise<{
  summary?: string;
  firstUserMessage?: string;
  messageCount: number;
}> {
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n').filter((l) => l.trim());

    let summary: string | undefined;
    let firstUserMessage: string | undefined;
    const messageCount = lines.length;

    for (const line of lines) {
      try {
        const entry: JsonlEntry = JSON.parse(line);

        // Look for summary entries
        if (entry.type === 'summary' && entry.summary && !summary) {
          summary = entry.summary;
        }

        // Look for first non-meta user message
        if (
          entry.type === 'user' &&
          !entry.isMeta &&
          entry.message?.role === 'user' &&
          !firstUserMessage
        ) {
          const text = extractTextContent(entry.message.content);
          if (text && text.trim()) {
            firstUserMessage = text.trim();
          }
        }

        // If we have both, we can stop early
        if (summary && firstUserMessage) {
          break;
        }
      } catch (parseErr) {
        // Skip invalid JSON lines
        continue;
      }
    }

    return { summary, firstUserMessage, messageCount };
  } catch (err) {
    console.error(`Error parsing metadata from ${filePath}: ${err}`);
    return { messageCount: 0 };
  }
}

/**
 * Get all conversations (.jsonl files) from a project directory
 */
async function getConversations(projectPath: string): Promise<Conversation[]> {
  try {
    const files = await readdir(projectPath);
    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'));

    const conversations: Conversation[] = [];

    for (const file of jsonlFiles) {
      const filePath = join(projectPath, file);
      try {
        const stats = await stat(filePath);
        const metadata = await parseConversationMetadata(filePath);

        conversations.push({
          name: file,
          path: filePath,
          modifiedTime: stats.mtime,
          size: stats.size,
          messageCount: metadata.messageCount,
          summary: metadata.summary,
          firstUserMessage: metadata.firstUserMessage,
        });
      } catch (err) {
        console.error(`Error reading file stats for ${file}: ${err}`);
      }
    }

    // Sort by modification time, most recent first
    return conversations.sort(
      (a, b) => b.modifiedTime.getTime() - a.modifiedTime.getTime()
    );
  } catch (err) {
    console.error(`Error reading conversations: ${err}`);
    return [];
  }
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format date in a readable format
 */
function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString();
}

/**
 * Parse the full JSONL conversation
 */
async function parseConversation(filePath: string): Promise<JsonlEntry[]> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n').filter((l: string) => l.trim());

  const entries: JsonlEntry[] = [];

  for (const line of lines) {
    try {
      const entry: JsonlEntry = JSON.parse(line);
      // Only include user, assistant, and system messages
      if (['user', 'assistant', 'system'].includes(entry.type)) {
        entries.push(entry);
      }
    } catch (err) {
      // Skip invalid JSON lines
      continue;
    }
  }

  return entries;
}

/**
 * Format content blocks as markdown
 */
function formatContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  let output = '';

  for (const block of content) {
    if (block.type === 'text') {
      output += (block as TextContent).text + '\n\n';
    } else if (block.type === 'thinking') {
      const thinking = (block as ThinkingContent).thinking;
      output += `<details>\n<summary><strong>Thinking</strong></summary>\n\n${thinking}\n\n</details>\n\n`;
    } else if (block.type === 'tool_use') {
      const tool = block as ToolUse;
      const inputStr = JSON.stringify(tool.input, null, 2);
      output += `**Tool Used:** \`${tool.name}\`\n\n\`\`\`json\n${inputStr}\n\`\`\`\n\n`;
    } else if (block.type === 'tool_result') {
      const result = block as ToolResult;
      let resultText = '';

      if (typeof result.content === 'string') {
        resultText = result.content;
      } else if (Array.isArray(result.content)) {
        resultText = result.content
          .map((c: any) => c.text || '')
          .join('\n');
      }

      const truncated = resultText.length > 2000 ? resultText.substring(0, 2000) + '\n\n... (truncated)' : resultText;
      output += `\`\`\`\n${truncated}\n\`\`\`\n\n`;
    }
  }

  return output;
}

/**
 * Check if a user message is just a tool result
 */
function isToolResultMessage(entry: JsonlEntry): boolean {
  if (entry.type !== 'user' || !entry.message?.content) return false;

  if (typeof entry.message.content === 'string') return false;
  if (!Array.isArray(entry.message.content)) return false;

  // Check if all content blocks are tool results
  return entry.message.content.every(block => block.type === 'tool_result');
}

/**
 * Convert JSONL conversation to markdown
 */
function convertToMarkdown(entries: JsonlEntry[], summary?: string, command?: string): string {
  let markdown = `# Claude Code Conversation\n\n`;

  if (command) {
    markdown += `> Generated with: \`${command}\`\n\n`;
  }

  if (summary) {
    markdown += `> **Summary:** ${summary}\n\n`;
  }

  markdown += `---\n\n`;

  let i = 0;
  while (i < entries.length) {
    const entry = entries[i];

    if (!entry.message) {
      i++;
      continue;
    }

    const timestamp = entry.timestamp
      ? new Date(entry.timestamp).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      : '';

    if (entry.type === 'user') {
      // Skip tool result messages
      if (entry.isMeta || isToolResultMessage(entry)) {
        i++;
        continue;
      }

      // Group consecutive user messages
      markdown += `### User\n\n`;
      if (timestamp) {
        markdown += `<sub>${timestamp}</sub>\n\n`;
      }

      // Add this message
      markdown += formatContent(entry.message.content);

      // Look for consecutive user messages
      let j = i + 1;
      while (j < entries.length && entries[j].type === 'user' && !isToolResultMessage(entries[j])) {
        markdown += formatContent(entries[j].message!.content);
        j++;
      }

      markdown += `\n\n---\n\n`;
      i = j;

    } else if (entry.type === 'assistant') {
      // Group consecutive assistant messages (including tool results in between)
      markdown += `### Assistant\n\n`;
      if (timestamp) {
        markdown += `<sub>${timestamp}</sub>\n\n`;
      }

      // Add this message
      markdown += formatContent(entry.message.content);

      // Look for consecutive assistant messages and tool results
      let j = i + 1;
      while (j < entries.length) {
        const nextEntry = entries[j];

        // Continue if it's an assistant message
        if (nextEntry.type === 'assistant') {
          markdown += formatContent(nextEntry.message!.content);
          j++;
        }
        // Continue if it's a tool result (skip, as it's already in assistant content)
        else if (nextEntry.type === 'user' && isToolResultMessage(nextEntry)) {
          j++;
        }
        // Stop at actual user input
        else {
          break;
        }
      }

      markdown += `\n\n---\n\n`;
      i = j;

    } else if (entry.type === 'system') {
      markdown += `<details>\n<summary>System</summary>\n\n`;
      markdown += formatContent(entry.message.content);
      markdown += `\n</details>\n\n\n---\n\n`;
      i++;
    } else {
      i++;
    }
  }

  return markdown;
}

/**
 * Format annotated user messages as markdown
 */
function formatAnnotatedMessages(
  result: AnnotatorResult,
  summary?: string,
  command?: string
): string {
  const { phases, annotations, stats } = result;
  let markdown = `# Claude Code Conversation - User Message Analysis\n\n`;

  if (command) {
    markdown += `> Generated with: \`${command}\`\n\n`;
  }

  if (summary) {
    markdown += `> **Summary:** ${summary}\n\n`;
  }

  markdown += `---\n\n`;

  // Statistics
  markdown += `## Statistics\n\n`;
  markdown += `- **Total messages analyzed:** ${stats.userMessages}\n`;
  markdown += `- 🟢 **Green (new tasks):** ${stats.greenCount}\n`;
  markdown += `- 🟡 **Yellow (steering):** ${stats.yellowCount}\n`;
  markdown += `- 🔴 **Red (restarts):** ${stats.redCount}\n\n`;

  // Phases
  markdown += `## Detected Phases\n\n`;
  phases.phases.forEach((phase, idx) => {
    markdown += `${idx + 1}. **${phase.phaseName}**\n`;
    markdown += `   - ${phase.description}\n`;
    markdown += `   - Messages: ${phase.messageIndices.join(', ')}\n\n`;
  });

  markdown += `---\n\n`;

  // Annotated messages
  markdown += `## User Messages\n\n`;

  annotations.forEach((ann) => {
    const colorEmoji = ann.color === 'green' ? '🟢' : ann.color === 'yellow' ? '🟡' : '🔴';

    // Find which phase this message belongs to
    const phase = phases.phases.find((p) => p.messageIndices.includes(ann.messageIndex));
    const phaseName = phase ? phase.phaseName : 'No phase';

    markdown += `### ${colorEmoji} Message #${ann.messageIndex}\n\n`;
    markdown += `**Phase:** ${phaseName}\n\n`;
    markdown += `**Label:** ${ann.annotation}\n\n`;
    markdown += `**Reasoning:** ${ann.reasoning}\n\n`;
    markdown += `**Content:**\n\n`;
    markdown += `> ${ann.content}\n\n`;
    markdown += `---\n\n`;
  });

  return markdown;
}

/**
 * Process a single JSONL file (non-interactive mode)
 */
async function processFile(filePath: string): Promise<void> {
  // Check if file exists
  try {
    await stat(filePath);
  } catch (err) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }

  // Parse the conversation
  const entries = await parseConversation(filePath);

  // Extract summary from entries
  const summary = entries.find(e => e.type === 'summary')?.summary;

  // Get the command used
  const command = `bun ccblog.ts ${filePath}`;

  // Ask about effectiveness analysis
  const wantAnalysis = await confirm({
    message: 'Analyze user message effectiveness (green/yellow/red ratings)?',
    default: false,
  });

  if (wantAnalysis) {
    // Extract user messages and analyze
    const userMessages = extractUserMessages(entries);

    if (userMessages.length === 0) {
      console.error('❌ No user messages found in conversation');
      process.exit(1);
    }

    const result = await analyzeConversation(userMessages);
    const markdown = formatAnnotatedMessages(result, summary, command);
    console.log(markdown);
  } else {
    // Regular markdown output
    const markdown = convertToMarkdown(entries, summary, command);
    console.log(markdown);
  }
}

/**
 * Main function
 */
async function main() {
  // Check for command-line argument (non-interactive mode)
  const args = process.argv.slice(2);

  if (args.length > 0) {
    // Non-interactive mode: process the file directly
    const filePath = args[0];
    await processFile(filePath);
    return;
  }

  // Interactive mode
  console.log(
    '\n🤖 Claude Code Blog Generator - Create a Gist from a Conversation\n'
  );

  // Step 1: Get and select project
  console.log('Loading projects...');
  const projects = await getProjects();

  if (projects.length === 0) {
    console.error('No Claude Code projects found in ~/.claude/projects');
    process.exit(1);
  }

  const selectedProject = await select({
    message: 'Select a Claude Code project:',
    choices: projects.map((p) => ({
      name:
        p.sessionCount !== undefined
          ? `${p.name} (${p.sessionCount} session${p.sessionCount !== 1 ? 's' : ''})`
          : p.name,
      value: p,
      description: p.path,
    })),
  });

  console.log(`\nLoading conversations from ${selectedProject.name}...`);

  // Step 2: Get and select conversation
  const conversations = await getConversations(selectedProject.path);

  if (conversations.length === 0) {
    console.error(`No conversations found in ${selectedProject.name}`);
    process.exit(1);
  }

  const selectedConversation = await select({
    message: 'Select a conversation:',
    choices: conversations.map((c) => {
      const description =
        c.summary || c.firstUserMessage || 'No description available';
      const truncatedDesc =
        description.length > 80
          ? description.substring(0, 80) + '...'
          : description;

      return {
        name: `${truncatedDesc} (${formatDate(c.modifiedTime)})`,
        value: c,
        description: `${c.messageCount} msgs - ${formatFileSize(c.size)} - ${c.name}`,
      };
    }),
    pageSize: 15,
  });

  console.log(`\nParsing conversation...`);

  // Step 3: Parse the conversation
  const entries = await parseConversation(selectedConversation.path);

  console.log(`Found ${entries.length} messages\n`);

  // Step 4: Ask about effectiveness analysis
  const wantAnalysis = await confirm({
    message: 'Analyze user message effectiveness (green/yellow/red ratings)?',
    default: false,
  });

  console.log('');

  if (wantAnalysis) {
    // Extract user messages and analyze
    const userMessages = extractUserMessages(entries);

    if (userMessages.length === 0) {
      console.error('❌ No user messages found in conversation');
      process.exit(1);
    }

    const result = await analyzeConversation(userMessages);
    const markdown = formatAnnotatedMessages(result, selectedConversation.summary);
    console.log(markdown);
  } else {
    // Step 5: Convert to markdown and output
    console.log(`Converting to markdown...`);
    const markdown = convertToMarkdown(entries, selectedConversation.summary);
    console.log('\n' + markdown);
  }
}

// Run the main function
main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
