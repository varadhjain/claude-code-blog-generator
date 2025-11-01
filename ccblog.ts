#!/usr/bin/env bun

import { readdir, stat } from 'fs/promises';
import { join, basename } from 'path';
import { homedir } from 'os';
import { select } from '@inquirer/prompts';
import { spawn } from 'child_process';

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
  summary?: string;
  firstUserMessage?: string;
}

interface JsonlEntry {
  type: string;
  summary?: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text: string }>;
  };
  isMeta?: boolean;
  timestamp?: string;
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
  content: string | Array<{ type: string; text: string }>
): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n');
  }
  return '';
}

/**
 * Parse a JSONL file to extract summary and first user message
 */
async function parseConversationMetadata(filePath: string): Promise<{
  summary?: string;
  firstUserMessage?: string;
}> {
  try {
    const content = await Bun.file(filePath).text();
    const lines = content.split('\n').filter((l) => l.trim());

    let summary: string | undefined;
    let firstUserMessage: string | undefined;

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

    return { summary, firstUserMessage };
  } catch (err) {
    console.error(`Error parsing metadata from ${filePath}: ${err}`);
    return {};
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
 * Create a GitHub gist from a file
 */
async function createGist(
  filePath: string,
  description?: string
): Promise<string | null> {
  return new Promise((resolve) => {
    const fileName = basename(filePath);
    const args = ['gist', 'create', filePath];

    if (description) {
      args.push('--desc', description);
    }

    // Secret is the default, no flag needed

    const gh = spawn('gh', args, {
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let output = '';
    let errorOutput = '';

    gh.stdout.on('data', (data) => {
      output += data.toString();
    });

    gh.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    gh.on('close', (code) => {
      if (code === 0) {
        // Extract URL from output (gh returns the gist URL)
        const url = output.trim().split('\n').pop()?.trim();
        resolve(url || null);
      } else {
        console.error(`Error creating gist: ${errorOutput}`);
        resolve(null);
      }
    });
  });
}

/**
 * Main function
 */
async function main() {
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
        description: `${c.name} - ${formatFileSize(c.size)}`,
      };
    }),
    pageSize: 15,
  });

  console.log(`\nCreating gist for ${selectedConversation.name}...`);

  // Step 3: Create gist
  const gistUrl = await createGist(
    selectedConversation.path,
    `Claude Code conversation from ${selectedProject.name}`
  );

  if (gistUrl) {
    console.log(`\n✅ Gist created successfully!`);
    console.log(`📎 URL: ${gistUrl}\n`);
  } else {
    console.error('\n❌ Failed to create gist');
    process.exit(1);
  }
}

// Run the main function
main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
