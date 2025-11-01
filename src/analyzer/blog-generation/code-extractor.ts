/**
 * Code & Artifact Extractor
 *
 * Takes meta-analysis output and extracts REAL artifacts from the session:
 * - Code snippets from Write/Edit tools
 * - Error messages from tool results
 * - User quotes
 * - Command outputs
 *
 * This grounds the LLM narrative in actual session data.
 */

import { MetaAnalysis } from '../../prompts/blog-generation/meta-analysis';

export type ArtifactType = 'code' | 'error' | 'quote' | 'command' | 'output';

export interface Artifact {
  type: ArtifactType;
  source_message: number;
  content: string;
  context: string; // What was happening
  file_path?: string; // For code artifacts
  tool_name?: string; // Which tool produced this
}

export interface CodeExtraction {
  section_name: string;
  message_range: [number, number];
  artifacts: Artifact[];
  summary: string; // Brief description of what these artifacts show
}

export interface ExtractionOptions {
  maxCodeLength?: number; // Truncate long code snippets
  maxArtifactsPerSection?: number; // Limit artifacts per section
  includeTypes?: ArtifactType[]; // Which types to extract
}

const DEFAULT_OPTIONS: Required<ExtractionOptions> = {
  maxCodeLength: 1000,
  maxArtifactsPerSection: 10,
  includeTypes: ['code', 'error', 'quote', 'command'],
};

export function extractCodeForPhases(
  messages: any[],
  metaAnalysis: MetaAnalysis,
  options: ExtractionOptions = {}
): CodeExtraction[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const extractions: CodeExtraction[] = [];

  // Extract for each suggested phase
  for (const phase of metaAnalysis.suggested_phases) {
    const [start, end] = phase.message_range;
    const phaseMessages = messages.slice(start, end + 1);

    const artifacts = extractArtifactsFromMessages(
      phaseMessages,
      start,
      opts
    );

    extractions.push({
      section_name: phase.name,
      message_range: phase.message_range,
      artifacts,
      summary: `Extracted ${artifacts.length} artifacts from ${phase.name}`,
    });
  }

  return extractions;
}

function extractArtifactsFromMessages(
  messages: any[],
  offset: number,
  options: Required<ExtractionOptions>
): Artifact[] {
  const artifacts: Artifact[] = [];

  messages.forEach((msg, idx) => {
    const msgIndex = offset + idx;

    // Extract from assistant messages
    if (msg.type === 'assistant' && msg.message?.content) {
      const content = msg.message.content;

      if (Array.isArray(content)) {
        for (const block of content) {
          // Extract code from Write tool
          if (
            block.type === 'tool_use' &&
            block.name === 'Write' &&
            options.includeTypes.includes('code')
          ) {
            const code = block.input?.content;
            const filePath = block.input?.file_path;

            if (code && filePath) {
              artifacts.push({
                type: 'code',
                source_message: msgIndex,
                content: truncateCode(code, options.maxCodeLength),
                context: `Created ${filePath}`,
                file_path: filePath,
                tool_name: 'Write',
              });
            }
          }

          // Extract code from Edit tool
          if (
            block.type === 'tool_use' &&
            block.name === 'Edit' &&
            options.includeTypes.includes('code')
          ) {
            const newString = block.input?.new_string;
            const filePath = block.input?.file_path;

            if (newString && filePath) {
              artifacts.push({
                type: 'code',
                source_message: msgIndex,
                content: truncateCode(newString, options.maxCodeLength),
                context: `Modified ${filePath}`,
                file_path: filePath,
                tool_name: 'Edit',
              });
            }
          }

          // Extract commands from Bash tool
          if (
            block.type === 'tool_use' &&
            block.name === 'Bash' &&
            options.includeTypes.includes('command')
          ) {
            const command = block.input?.command;
            if (command) {
              artifacts.push({
                type: 'command',
                source_message: msgIndex,
                content: command,
                context: block.input?.description || 'Shell command',
                tool_name: 'Bash',
              });
            }
          }

          // Extract text quotes from assistant
          if (block.type === 'text' && options.includeTypes.includes('quote')) {
            const text = block.text;
            // Only include substantial text (not tool descriptions)
            if (text && text.length > 50 && text.length < 500) {
              artifacts.push({
                type: 'quote',
                source_message: msgIndex,
                content: text,
                context: 'Assistant explanation',
                tool_name: 'text',
              });
            }
          }
        }
      }
    }

    // Extract from user messages
    if (msg.type === 'user' && msg.message?.content) {
      const content = msg.message.content;

      // User text content
      if (typeof content === 'string' && options.includeTypes.includes('quote')) {
        if (content.length > 20 && content.length < 500) {
          artifacts.push({
            type: 'quote',
            source_message: msgIndex,
            content: content,
            context: 'User request',
          });
        }
      }

      // Tool results
      if (Array.isArray(content)) {
        for (const block of content) {
          // Extract errors
          if (
            block.type === 'tool_result' &&
            block.is_error &&
            options.includeTypes.includes('error')
          ) {
            const errorContent =
              typeof block.content === 'string'
                ? block.content
                : JSON.stringify(block.content);

            artifacts.push({
              type: 'error',
              source_message: msgIndex,
              content: truncateCode(errorContent, options.maxCodeLength),
              context: `Error from tool ${block.tool_use_id}`,
            });
          }

          // Extract successful command outputs
          if (
            block.type === 'tool_result' &&
            !block.is_error &&
            options.includeTypes.includes('output')
          ) {
            const output =
              typeof block.content === 'string'
                ? block.content
                : JSON.stringify(block.content);

            // Only include interesting outputs (not too long, not empty)
            if (output.length > 10 && output.length < 1000) {
              artifacts.push({
                type: 'output',
                source_message: msgIndex,
                content: truncateCode(output, options.maxCodeLength),
                context: 'Command output',
              });
            }
          }
        }
      }
    }
  });

  // Limit artifacts per section
  return artifacts.slice(0, options.maxArtifactsPerSection);
}

function truncateCode(code: string, maxLength: number): string {
  if (code.length <= maxLength) {
    return code;
  }

  const truncated = code.slice(0, maxLength);
  const lastNewline = truncated.lastIndexOf('\n');

  if (lastNewline > maxLength * 0.8) {
    // Truncate at last newline if it's close to the limit
    return truncated.slice(0, lastNewline) + '\n... [truncated]';
  }

  return truncated + '... [truncated]';
}

/**
 * Find the most "interesting" artifacts for inclusion in blog post
 */
export function selectInterestingArtifacts(
  extractions: CodeExtraction[],
  maxTotal: number = 20
): Artifact[] {
  const allArtifacts = extractions.flatMap((e) => e.artifacts);

  // Score artifacts by "interestingness"
  const scored = allArtifacts.map((artifact) => ({
    artifact,
    score: scoreArtifact(artifact),
  }));

  // Sort by score and take top N
  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxTotal).map((s) => s.artifact);
}

function scoreArtifact(artifact: Artifact): number {
  let score = 0;

  // Code artifacts are generally interesting
  if (artifact.type === 'code') {
    score += 10;

    // New files more interesting than edits
    if (artifact.tool_name === 'Write') {
      score += 5;
    }

    // Certain file types more interesting
    if (artifact.file_path) {
      if (artifact.file_path.match(/\.(ts|tsx|js|jsx)$/)) {
        score += 3; // Source code
      } else if (artifact.file_path.match(/\.md$/)) {
        score += 2; // Documentation
      } else if (artifact.file_path.match(/package\.json|tsconfig/)) {
        score += 4; // Config files
      }
    }
  }

  // Errors are very interesting
  if (artifact.type === 'error') {
    score += 15;
  }

  // Commands are moderately interesting
  if (artifact.type === 'command') {
    score += 5;

    // Git commands more interesting
    if (artifact.content.includes('git')) {
      score += 3;
    }

    // Test/build commands very interesting
    if (artifact.content.match(/test|build|npm|yarn/)) {
      score += 5;
    }
  }

  // User quotes somewhat interesting
  if (artifact.type === 'quote') {
    score += 3;
  }

  // Longer content generally more substantial
  score += Math.min(artifact.content.length / 100, 10);

  return score;
}
