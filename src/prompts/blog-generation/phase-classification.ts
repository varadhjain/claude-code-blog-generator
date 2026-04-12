/**
 * Phase Classification Prompt
 *
 * Analyzes a window of 3-5 messages to determine what phase of development
 * is happening: Setup, Planning, Coding, Debugging, Testing, Documentation, etc.
 */

import { OpenAIClient } from '../../ai/client';

export type PhaseType =
  | 'setup'
  | 'planning'
  | 'coding'
  | 'debugging'
  | 'testing'
  | 'documentation'
  | 'refactoring'
  | 'deployment'
  | 'discussion';

export interface MessageWindow {
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
    tools_used?: string[];
  }>;
  files_mentioned?: string[];
  timestamp_start?: string;
  timestamp_end?: string;
}

export interface PhaseClassification {
  phase: PhaseType;
  confidence: number;
  objective: string;
  reasoning: string;
}

const SYSTEM_PROMPT = `You are an expert at analyzing software development sessions and identifying what phase of work is happening.

Your task is to analyze a window of messages from a Claude Code session and classify the phase of development.

PHASE DEFINITIONS:
- setup: Exploring codebase, reading files, understanding structure, installing dependencies
- planning: Discussing approach, breaking down tasks, creating milestones, asking questions
- coding: Writing new code, creating files, implementing features
- debugging: Fixing errors, investigating bugs, running tests that fail
- testing: Writing tests, running test suites, validating functionality
- documentation: Writing docs, README updates, comments, API documentation
- refactoring: Restructuring code, renaming, improving existing code without new features
- deployment: Building, deploying, CI/CD, publishing packages
- discussion: General conversation, clarifying requirements, back-and-forth dialogue

KEY SIGNALS:
- Tool usage patterns matter:
  * Read, Glob, Grep = setup/exploration
  * Write (new files) = coding
  * Edit = refactoring or debugging
  * Bash (npm test, jest) = testing
  * TodoWrite, ExitPlanMode = planning
  * Bash (git, npm publish) = deployment

- File patterns matter:
  * Reading many files = setup
  * Writing src/*.ts = coding
  * Editing tests = testing
  * Writing *.md = documentation

- Error messages = debugging
- "Let's plan", "should we" = planning
- "Fixed", "now working" = debugging

Respond with valid JSON only, no additional text.`;

export async function classifyPhase(
  client: OpenAIClient,
  window: MessageWindow
): Promise<PhaseClassification> {
  // Build user prompt with window data
  const userPrompt = buildUserPrompt(window);

  const result = await client.callStructured<PhaseClassification>(
    'phase-classification',
    SYSTEM_PROMPT,
    userPrompt,
    {
      temperature: 0.3, // Lower temperature for consistent classification
      maxTokens: 2500,
    }
  );

  return result;
}

function buildUserPrompt(window: MessageWindow): string {
  const parts: string[] = ['Analyze this message window:\n'];

  // Add messages
  parts.push('MESSAGES:');
  window.messages.forEach((msg, idx) => {
    parts.push(`${idx + 1}. ${msg.role.toUpperCase()}: ${msg.content}`);
    if (msg.tools_used && msg.tools_used.length > 0) {
      parts.push(`   Tools used: ${msg.tools_used.join(', ')}`);
    }
  });

  // Add file context if available
  if (window.files_mentioned && window.files_mentioned.length > 0) {
    parts.push('\nFILES MENTIONED:');
    window.files_mentioned.forEach((file) => {
      parts.push(`- ${file}`);
    });
  }

  parts.push(
    '\nRespond with JSON in this exact format:',
    '{',
    '  "phase": "setup|planning|coding|debugging|testing|documentation|refactoring|deployment|discussion",',
    '  "confidence": 0.0-1.0,',
    '  "objective": "brief description of what is being worked on",',
    '  "reasoning": "why you classified it this way"',
    '}'
  );

  return parts.join('\n');
}

/**
 * Helper function to extract tools from actual session messages
 */
export function extractToolsFromMessage(message: any): string[] {
  const tools: string[] = [];

  if (message.type === 'assistant' && message.message?.content) {
    const content = message.message.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_use' && block.name) {
          tools.push(block.name);
        }
      }
    }
  }

  return tools;
}

/**
 * Helper to convert raw session messages to MessageWindow format
 */
export function createMessageWindow(messages: any[]): MessageWindow {
  const window: MessageWindow = {
    messages: [],
    files_mentioned: [],
  };

  for (const msg of messages) {
    if (msg.type === 'user' || msg.type === 'assistant') {
      const role = msg.type as 'user' | 'assistant';
      let content = '';
      const tools: string[] = [];

      if (msg.message?.content) {
        if (typeof msg.message.content === 'string') {
          content = msg.message.content.slice(0, 500); // Truncate to save tokens
        } else if (Array.isArray(msg.message.content)) {
          // Extract text and tool usage
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              content += block.text.slice(0, 300) + ' ';
            } else if (block.type === 'tool_use') {
              tools.push(block.name);
              // Extract file paths from tool inputs
              if (block.input?.file_path) {
                window.files_mentioned?.push(block.input.file_path);
              }
            }
          }
        }
      }

      window.messages.push({
        role,
        content: content.trim() || '[no text content]',
        tools_used: tools.length > 0 ? tools : undefined,
      });

      // Set timestamps from first and last message
      if (!window.timestamp_start && msg.timestamp) {
        window.timestamp_start = msg.timestamp;
      }
      if (msg.timestamp) {
        window.timestamp_end = msg.timestamp;
      }
    }
  }

  return window;
}
