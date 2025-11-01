/**
 * Session Indexer
 *
 * Creates a compact index of long sessions by chunking and summarizing.
 * Enables meta-analysis of sessions that exceed context limits.
 */

export interface ChunkIndex {
  message_range: [number, number];
  summary: string; // Brief description of this chunk
  tool_counts: Record<string, number>;
  files_touched: string[];
  key_moments: string[]; // Important events in this chunk
}

export interface SessionIndex {
  total_messages: number;
  chunk_size: number;
  chunks: ChunkIndex[];
  global_stats: {
    total_tools_used: Record<string, number>;
    total_files_created: number;
    total_files_modified: number;
    duration_minutes: number;
  };
}

const DEFAULT_CHUNK_SIZE = 50; // messages per chunk

export function createSessionIndex(
  messages: any[],
  chunkSize: number = DEFAULT_CHUNK_SIZE
): SessionIndex {
  const index: SessionIndex = {
    total_messages: messages.length,
    chunk_size: chunkSize,
    chunks: [],
    global_stats: {
      total_tools_used: {},
      total_files_created: 0,
      total_files_modified: 0,
      duration_minutes: 0,
    },
  };

  // Calculate duration
  const timestamps = messages
    .filter((m) => m.timestamp)
    .map((m) => new Date(m.timestamp).getTime());
  if (timestamps.length > 1) {
    index.global_stats.duration_minutes = Math.round(
      (Math.max(...timestamps) - Math.min(...timestamps)) / 1000 / 60
    );
  }

  // Process in chunks
  for (let i = 0; i < messages.length; i += chunkSize) {
    const chunkMessages = messages.slice(i, i + chunkSize);
    const chunkIndex = analyzeChunk(chunkMessages, i);
    index.chunks.push(chunkIndex);

    // Aggregate global stats
    for (const [tool, count] of Object.entries(chunkIndex.tool_counts)) {
      index.global_stats.total_tools_used[tool] =
        (index.global_stats.total_tools_used[tool] || 0) + count;
    }
  }

  // Count total files
  const allFilesCreated = new Set<string>();
  const allFilesModified = new Set<string>();
  index.chunks.forEach((chunk) => {
    chunk.files_touched.forEach((file) => {
      if (chunk.tool_counts.Write > 0) {
        allFilesCreated.add(file);
      }
      if (chunk.tool_counts.Edit > 0) {
        allFilesModified.add(file);
      }
    });
  });
  index.global_stats.total_files_created = allFilesCreated.size;
  index.global_stats.total_files_modified = allFilesModified.size;

  return index;
}

function analyzeChunk(messages: any[], startIndex: number): ChunkIndex {
  const chunk: ChunkIndex = {
    message_range: [startIndex, startIndex + messages.length - 1],
    summary: '',
    tool_counts: {},
    files_touched: [],
    key_moments: [],
  };

  const fileSet = new Set<string>();
  const toolsUsed: string[] = [];

  messages.forEach((msg, idx) => {
    if (msg.type === 'assistant' && msg.message?.content) {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use') {
            const toolName = block.name;
            chunk.tool_counts[toolName] = (chunk.tool_counts[toolName] || 0) + 1;
            toolsUsed.push(toolName);

            // Track files
            if (block.input?.file_path) {
              fileSet.add(block.input.file_path);
            }

            // Track key moments
            if (toolName === 'AskUserQuestion') {
              chunk.key_moments.push(
                `Decision point at message ${startIndex + idx}`
              );
            } else if (toolName === 'ExitPlanMode') {
              chunk.key_moments.push(
                `Phase transition at message ${startIndex + idx}`
              );
            } else if (toolName === 'TodoWrite') {
              chunk.key_moments.push(
                `Progress update at message ${startIndex + idx}`
              );
            }
          }
        }
      }
    }

    // Track errors
    if (msg.type === 'user' && msg.message?.content) {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_result' && block.is_error) {
            chunk.key_moments.push(`Error at message ${startIndex + idx}`);
          }
        }
      }
    }
  });

  chunk.files_touched = Array.from(fileSet);

  // Generate summary based on tool patterns
  chunk.summary = generateChunkSummary(chunk.tool_counts, chunk.files_touched);

  return chunk;
}

function generateChunkSummary(
  toolCounts: Record<string, number>,
  files: string[]
): string {
  const parts: string[] = [];

  // Primary activity based on dominant tool
  const sortedTools = Object.entries(toolCounts).sort((a, b) => b[1] - a[1]);

  if (sortedTools.length === 0) {
    return 'Discussion or exploration';
  }

  const [dominantTool, count] = sortedTools[0];

  if (dominantTool === 'Write') {
    parts.push(`Created ${count} file${count > 1 ? 's' : ''}`);
  } else if (dominantTool === 'Edit') {
    parts.push(`Modified ${count} file${count > 1 ? 's' : ''}`);
  } else if (dominantTool === 'Read' || dominantTool === 'Glob') {
    parts.push('Code exploration and discovery');
  } else if (dominantTool === 'Bash') {
    if (toolCounts['Bash'] > 5) {
      parts.push('Running tests and build commands');
    } else {
      parts.push('Shell commands and git operations');
    }
  } else if (dominantTool === 'TodoWrite') {
    parts.push('Planning and task tracking');
  } else if (dominantTool === 'ExitPlanMode') {
    parts.push('Planning phase completion');
  } else if (dominantTool === 'AskUserQuestion') {
    parts.push('Decision making and clarification');
  } else if (dominantTool === 'Task') {
    parts.push('Delegated analysis');
  } else {
    parts.push(`${dominantTool} operations`);
  }

  // Add file type info if relevant
  if (files.length > 0) {
    const mdFiles = files.filter((f) => f.endsWith('.md')).length;
    const tsFiles = files.filter((f) => f.match(/\.(ts|js|tsx|jsx)$/)).length;
    const configFiles = files.filter((f) =>
      f.match(/(package\.json|tsconfig|\.eslintrc|\.prettier)/)
    ).length;

    if (mdFiles > 0) {
      parts.push(`${mdFiles} doc file${mdFiles > 1 ? 's' : ''}`);
    }
    if (tsFiles > 0) {
      parts.push(`${tsFiles} code file${tsFiles > 1 ? 's' : ''}`);
    }
    if (configFiles > 0) {
      parts.push(`${configFiles} config file${configFiles > 1 ? 's' : ''}`);
    }
  }

  return parts.join('; ');
}

/**
 * Convert index to compact text for LLM consumption
 */
export function indexToText(index: SessionIndex): string {
  const lines: string[] = [];

  lines.push(`SESSION INDEX (${index.total_messages} messages total)\n`);

  lines.push('GLOBAL STATS:');
  lines.push(`  Duration: ~${index.global_stats.duration_minutes} minutes`);
  lines.push(`  Files created: ${index.global_stats.total_files_created}`);
  lines.push(`  Files modified: ${index.global_stats.total_files_modified}`);
  lines.push('  Top tools:');
  const topTools = Object.entries(index.global_stats.total_tools_used)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  topTools.forEach(([tool, count]) => {
    lines.push(`    - ${tool}: ${count}x`);
  });

  lines.push('\nCHUNKS:');
  index.chunks.forEach((chunk, i) => {
    lines.push(
      `\n${i + 1}. Messages ${chunk.message_range[0]}-${chunk.message_range[1]}`
    );
    lines.push(`   ${chunk.summary}`);

    if (chunk.key_moments.length > 0) {
      lines.push(`   Key moments: ${chunk.key_moments.join(', ')}`);
    }

    if (chunk.files_touched.length > 0) {
      const filePreview = chunk.files_touched.slice(0, 5).join(', ');
      if (chunk.files_touched.length > 5) {
        lines.push(
          `   Files: ${filePreview} ... and ${chunk.files_touched.length - 5} more`
        );
      } else {
        lines.push(`   Files: ${filePreview}`);
      }
    }
  });

  return lines.join('\n');
}
