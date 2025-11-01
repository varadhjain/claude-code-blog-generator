#!/usr/bin/env ts-node
/**
 * Interactive TUI for User Message Annotation
 *
 * Allows browsing directories and selecting JSONL session files
 * to run Option C (contextual) annotation on.
 *
 * Usage:
 *   npm run annotate
 *   npx ts-node scripts/annotate-tui.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { input, select, confirm } from '@inquirer/prompts';
import { OpenAIClient } from '../../src/ai/client';
import { analyzeSession, formatAnnotations } from '../../src/user-annotations';
import { uploadToGist } from '../../src/gist-uploader';

interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
}

async function main() {
  console.clear();
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   📝 User Message Annotation Tool (Option C)     ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

  // Start in current directory or examples/
  const examplesDir = path.resolve(process.cwd(), 'examples');
  const startDir = fs.existsSync(examplesDir) ? examplesDir : process.cwd();

  const selectedFile = await browseForFile(startDir);

  if (!selectedFile) {
    console.log('❌ No file selected. Exiting...');
    return;
  }

  console.log('');
  console.log(`Selected: ${selectedFile}`);
  console.log('');

  // Ask if they want to save output
  const saveOutput = await confirm({
    message: 'Save annotations to JSON file?',
    default: true,
  });

  let outputPath: string | undefined;
  if (saveOutput) {
    const defaultOutput = selectedFile.replace('.jsonl', '-annotations.json');
    outputPath = await input({
      message: 'Output file path:',
      default: defaultOutput,
    });
  }

  console.log('');
  console.log('🚀 Running annotation analysis...');
  console.log('');

  try {
    const client = new OpenAIClient();
    const result = await analyzeSession(client, {
      sessionPath: selectedFile,
      outputPath,
    });

    console.log(formatAnnotations(result));
    console.log(client.getTokenTracker().report());

    console.log('✅ Analysis complete!');
    console.log('');

    if (outputPath) {
      console.log(`📄 Annotations saved to: ${outputPath}`);
    }

    // Ask if they want to upload to Gist
    const uploadGist = await confirm({
      message: 'Upload annotations to GitHub Gist?',
      default: false,
    });

    if (uploadGist) {
      console.log('');
      console.log('🚀 Uploading to GitHub Gist...');

      try {
        const sessionName = path.basename(selectedFile);
        const gistResult = await uploadToGist(result, sessionName, {
          isPublic: true,
        });

        console.log('');
        console.log('✅ Gist created successfully!');
        console.log(`🔗 URL: ${gistResult.url}`);
        console.log('');
      } catch (error) {
        console.error('');
        console.error(
          '❌ Failed to create gist:',
          error instanceof Error ? error.message : error
        );
        console.error('');
      }
    }
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

/**
 * Browse for a JSONL file
 */
async function browseForFile(startPath: string): Promise<string | null> {
  let currentPath = startPath;

  while (true) {
    const items = getDirectoryContents(currentPath);

    if (items.length === 0) {
      console.log('📁 Empty directory');
      const goBack = await confirm({
        message: 'Go back to parent directory?',
        default: true,
      });

      if (goBack) {
        currentPath = path.dirname(currentPath);
        continue;
      } else {
        return null;
      }
    }

    // Add parent directory option
    const choices = [
      {
        name: '📂 .. (parent directory)',
        value: '..',
        description: path.dirname(currentPath),
      },
    ];

    // Add directories first
    items
      .filter((item) => item.isDirectory)
      .forEach((item) => {
        choices.push({
          name: `📁 ${item.name}/`,
          value: item.path,
          description: 'Directory',
        });
      });

    // Add JSONL files
    const jsonlFiles = items.filter(
      (item) => !item.isDirectory && item.name.endsWith('.jsonl')
    );
    jsonlFiles.forEach((item) => {
      const sizeKB = item.size ? (item.size / 1024).toFixed(1) : '?';
      choices.push({
        name: `📄 ${item.name}`,
        value: item.path,
        description: `${sizeKB} KB`,
      });
    });

    if (jsonlFiles.length === 0) {
      choices.push({
        name: '⚠️  No .jsonl files in this directory',
        value: 'no-files',
        description: 'Navigate to a different directory',
      });
    }

    const choice = await select({
      message: `Current: ${currentPath}\nSelect a file or directory:`,
      choices,
      pageSize: 15,
    });

    if (choice === 'no-files') {
      continue;
    }

    if (choice === '..') {
      currentPath = path.dirname(currentPath);
      continue;
    }

    const stat = fs.statSync(choice);
    if (stat.isDirectory()) {
      currentPath = choice;
      continue;
    }

    // Selected a file
    return choice;
  }
}

/**
 * Get directory contents
 */
function getDirectoryContents(dirPath: string): FileItem[] {
  try {
    const entries = fs.readdirSync(dirPath);
    const items: FileItem[] = [];

    for (const entry of entries) {
      // Skip hidden files
      if (entry.startsWith('.')) continue;

      const fullPath = path.join(dirPath, entry);
      try {
        const stat = fs.statSync(fullPath);
        items.push({
          name: entry,
          path: fullPath,
          isDirectory: stat.isDirectory(),
          size: stat.isFile() ? stat.size : undefined,
        });
      } catch (err) {
        // Skip files we can't stat (permission issues, etc.)
        continue;
      }
    }

    // Sort: directories first, then files alphabetically
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    return items;
  } catch (err) {
    console.error(`Error reading directory: ${dirPath}`);
    return [];
  }
}

main();
