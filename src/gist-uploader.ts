/**
 * GitHub Gist Uploader
 *
 * Upload annotation results to a public GitHub Gist using gh CLI
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AnnotatorResult } from './user-annotations';

export interface GistUploadOptions {
  isPublic?: boolean; // Default: true (public gist)
  description?: string;
}

export interface GistUploadResult {
  url: string;
}

/**
 * Upload annotation results to GitHub Gist using gh CLI
 */
export async function uploadToGist(
  result: AnnotatorResult,
  sessionName: string,
  options: GistUploadOptions = {}
): Promise<GistUploadResult> {
  // Check if gh CLI is installed
  try {
    execSync('gh --version', { stdio: 'ignore' });
  } catch (error) {
    throw new Error(
      'gh CLI not found. Install it from https://cli.github.com/ and run `gh auth login`'
    );
  }

  // Create filename from session name
  const filename = sessionName.endsWith('.jsonl')
    ? sessionName.replace('.jsonl', '-annotations.json')
    : `${sessionName}-annotations.json`;

  // Prepare gist content
  const gistContent = JSON.stringify(
    {
      sessionName,
      generatedAt: new Date().toISOString(),
      phases: result.phases,
      annotations: result.annotations,
      stats: result.stats,
    },
    null,
    2
  );

  // Write to temporary file
  const tempFile = path.join(os.tmpdir(), filename);
  fs.writeFileSync(tempFile, gistContent, 'utf-8');

  try {
    // Create gist using gh CLI
    const visibility = options.isPublic !== false ? '--public' : '--secret';
    const description =
      options.description || `User Message Annotations for ${sessionName}`;

    const command = `gh gist create ${visibility} -d "${description}" "${tempFile}"`;
    const output = execSync(command, { encoding: 'utf-8' }).trim();

    // Clean up temp file
    fs.unlinkSync(tempFile);

    // gh gist create returns the URL
    return {
      url: output,
    };
  } catch (error) {
    // Clean up temp file on error
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    throw new Error(`Failed to create gist: ${error}`);
  }
}
