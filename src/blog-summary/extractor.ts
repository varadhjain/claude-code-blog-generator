/**
 * Data Extractor for Blog Summary Generation
 *
 * Extracts narrative elements from annotated session data:
 * - Goal and outcome
 * - Key prompts (user messages)
 * - Code snippets from tool uses
 * - Session metadata
 */

import type { AnnotatorResult, UserMessagePhase } from '../user-annotations';

// ============================================================================
// TYPES
// ============================================================================

export interface SessionMessage {
  type: string;
  message?: {
    role: string;
    content: string | any[];
  };
  timestamp?: string;
  index: number;
}

export interface ExtractedGoal {
  text: string;
  messageIndex: number;
  source: 'annotation' | 'first_message';
}

export interface ExtractedOutcome {
  text: string;
  lastPhase?: string;
  source: 'last_phase' | 'last_messages';
}

export interface KeyPrompt {
  text: string;
  annotation: string;
  color: 'green' | 'yellow' | 'red';
  messageIndex: number;
  phaseId?: number;
  reasoning: string;
}

export interface CodeSnippet {
  code: string;
  language: string;
  context: string; // What was happening when this code was written
  toolName: string;
  phaseId?: number;
  messageIndex: number;
}

export interface SessionMetadata {
  duration: string;
  messageCount: number;
  userMessageCount: number;
  phaseCount: number;
  startTime?: string;
  endTime?: string;
}

// ============================================================================
// GOAL EXTRACTION
// ============================================================================

/**
 * Extract the session goal from annotations or first user message
 */
export function extractGoal(
  messages: SessionMessage[],
  annotations: AnnotatorResult
): ExtractedGoal {
  // Strategy 1: Use first green annotation (new task start)
  const firstGreen = annotations.annotations.find(a => a.color === 'green');
  if (firstGreen) {
    return {
      text: firstGreen.content,
      messageIndex: firstGreen.messageIndex,
      source: 'annotation'
    };
  }

  // Strategy 2: Use first user message
  const firstUserMsg = messages.find(m => m.message?.role === 'user');
  if (firstUserMsg && firstUserMsg.message?.content) {
    const content = extractTextContent(firstUserMsg.message.content);
    return {
      text: content.substring(0, 500), // Limit length
      messageIndex: firstUserMsg.index,
      source: 'first_message'
    };
  }

  // Fallback
  return {
    text: 'Session analysis',
    messageIndex: 0,
    source: 'first_message'
  };
}

// ============================================================================
// OUTCOME EXTRACTION
// ============================================================================

/**
 * Extract the session outcome from last phase or final messages
 */
export function extractOutcome(
  messages: SessionMessage[],
  annotations: AnnotatorResult
): ExtractedOutcome {
  const { phases } = annotations.phases;

  // Strategy 1: Use last phase description
  if (phases.length > 0) {
    const lastPhase = phases[phases.length - 1];
    return {
      text: lastPhase.description,
      lastPhase: lastPhase.phaseName,
      source: 'last_phase'
    };
  }

  // Strategy 2: Use last few user messages
  const userMessages = messages.filter(m => m.message?.role === 'user');
  const lastUserMessages = userMessages.slice(-3);
  const outcomeText = lastUserMessages
    .map(m => extractTextContent(m.message!.content))
    .join(' ');

  return {
    text: outcomeText.substring(0, 500),
    source: 'last_messages'
  };
}

// ============================================================================
// KEY PROMPTS EXTRACTION
// ============================================================================

/**
 * Extract key prompts (green and red annotations primarily)
 */
export function extractKeyPrompts(
  _messages: SessionMessage[],
  annotations: AnnotatorResult,
  maxPerPhase: number = 5
): KeyPrompt[] {
  const keyPrompts: KeyPrompt[] = [];

  // Priority: Green (task starts) and Red (pivots) annotations
  const priorityAnnotations = annotations.annotations.filter(
    a => a.color === 'green' || a.color === 'red'
  );

  // Add all green/red prompts
  for (const annotation of priorityAnnotations) {
    keyPrompts.push({
      text: annotation.content,
      annotation: annotation.annotation,
      color: annotation.color,
      messageIndex: annotation.messageIndex,
      reasoning: annotation.reasoning
    });
  }

  // Add significant yellow prompts (longer messages that clarify)
  const yellowPrompts = annotations.annotations
    .filter(a => a.color === 'yellow' && a.content.length > 100)
    .slice(0, maxPerPhase);

  for (const annotation of yellowPrompts) {
    keyPrompts.push({
      text: annotation.content,
      annotation: annotation.annotation,
      color: annotation.color,
      messageIndex: annotation.messageIndex,
      reasoning: annotation.reasoning
    });
  }

  // Sort by message index
  return keyPrompts.sort((a, b) => a.messageIndex - b.messageIndex);
}

// ============================================================================
// CODE SNIPPET EXTRACTION
// ============================================================================

/**
 * Extract code snippets from tool_use and tool_result blocks
 */
export function extractCodeSnippets(
  messages: SessionMessage[],
  _maxPerPhase: number = 3
): CodeSnippet[] {
  const snippets: CodeSnippet[] = [];

  for (const message of messages) {
    if (!message.message?.content || typeof message.message.content === 'string') {
      continue;
    }

    const content = message.message.content;
    if (!Array.isArray(content)) continue;

    // Look for tool_use blocks (Write, Edit operations)
    for (const block of content) {
      if (block.type === 'tool_use') {
        const toolName = block.name;

        // Extract code from Write tool
        if (toolName === 'Write' && block.input?.content) {
          snippets.push({
            code: block.input.content,
            language: detectLanguage(block.input.file_path || ''),
            context: `Writing ${block.input.file_path || 'file'}`,
            toolName,
            messageIndex: message.index
          });
        }

        // Extract code from Edit tool
        if (toolName === 'Edit' && block.input?.new_string) {
          snippets.push({
            code: block.input.new_string,
            language: detectLanguage(block.input.file_path || ''),
            context: `Editing ${block.input.file_path || 'file'}`,
            toolName,
            messageIndex: message.index
          });
        }
      }

      // Look for tool_result blocks with code
      if (block.type === 'tool_result' && block.content) {
        const resultText = typeof block.content === 'string'
          ? block.content
          : JSON.stringify(block.content, null, 2);

        // Only include if it looks like code (has meaningful structure)
        if (resultText.length > 50 && resultText.length < 2000) {
          snippets.push({
            code: resultText,
            language: 'text',
            context: `Result from tool`,
            toolName: 'tool_result',
            messageIndex: message.index
          });
        }
      }
    }
  }

  // Limit total snippets to avoid overwhelming the summary
  return snippets.slice(0, _maxPerPhase * 3);
}

// ============================================================================
// SESSION METADATA
// ============================================================================

/**
 * Calculate session metadata (duration, counts, etc.)
 */
export function extractMetadata(
  messages: SessionMessage[],
  annotations: AnnotatorResult
): SessionMetadata {
  const timestamps = messages
    .filter(m => m.timestamp)
    .map(m => new Date(m.timestamp!));

  const startTime = timestamps.length > 0 ? timestamps[0] : undefined;
  const endTime = timestamps.length > 0 ? timestamps[timestamps.length - 1] : undefined;

  const durationMs = startTime && endTime ? endTime.getTime() - startTime.getTime() : 0;
  const durationMinutes = Math.floor(durationMs / 60000);

  return {
    duration: formatDuration(durationMinutes),
    messageCount: messages.length,
    userMessageCount: annotations.stats.userMessages,
    phaseCount: annotations.phases.phases.length,
    startTime: startTime?.toISOString(),
    endTime: endTime?.toISOString()
  };
}

// ============================================================================
// PHASE GROUPING
// ============================================================================

/**
 * Group items by phase for organized narrative
 */
export function groupByPhase<T extends { messageIndex: number }>(
  items: T[],
  phases: UserMessagePhase[]
): Map<number, T[]> {
  const grouped = new Map<number, T[]>();

  for (const item of items) {
    const phase = phases.find(p => p.messageIndices.includes(item.messageIndex));
    const phaseId = phase?.phaseId ?? -1; // -1 for items not in any phase

    if (!grouped.has(phaseId)) {
      grouped.set(phaseId, []);
    }
    grouped.get(phaseId)!.push(item);
  }

  return grouped;
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Extract text content from message (handles string or array format)
 */
function extractTextContent(content: string | any[]): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter(item => item.type === 'text')
      .map(item => item.text || '')
      .join('\n\n');
  }
  return '';
}

/**
 * Detect programming language from file path
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';

  const langMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescript',
    'js': 'javascript',
    'jsx': 'javascript',
    'py': 'python',
    'rb': 'ruby',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'go': 'go',
    'rs': 'rust',
    'md': 'markdown',
    'json': 'json',
    'yaml': 'yaml',
    'yml': 'yaml',
    'html': 'html',
    'css': 'css',
    'scss': 'scss',
    'sh': 'bash'
  };

  return langMap[ext] || 'text';
}

/**
 * Format duration in human-readable form
 */
function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
