/**
 * User Message Annotation Prompt
 *
 * Analyzes all user messages from a session and annotates each with:
 * - One-line explanation of what the user is doing
 * - Color code (green/yellow/red) indicating session flow
 */

import { OpenAIClient } from '../ai/client';

export type AnnotationColor = 'green' | 'yellow' | 'red';

export interface UserMessageInput {
  index: number; // Position in original session
  content: string; // User's message text
}

export interface UserMessageAnnotation {
  messageIndex: number;
  content: string;
  annotation: string; // One-line explanation
  color: AnnotationColor;
}

export interface AnnotationResult {
  annotations: UserMessageAnnotation[];
  summary: string; // Overall session summary
}

const SYSTEM_PROMPT = `You are an expert at analyzing Claude Code development sessions.

Your task: Annotate each user message with a one-line explanation and color code.

COLOR MEANINGS:
🟢 GREEN - Starting a new task or phase of work
  * "Let's build X"
  * "Now let's add Y feature"
  * "Can you help me with Z?"
  * First message in a new direction

🟡 YELLOW - Steering or correcting ongoing work
  * "Actually, do it this way instead"
  * "Wait, that's not quite right"
  * "Can you also add..."
  * "Let me clarify..."
  * Minor course corrections within same task

🔴 RED - Major issue or restart
  * "This is completely wrong, let's start over"
  * "Stop, we need a different approach"
  * "That broke everything"
  * Complete pivots or error recovery

ANNOTATION GUIDELINES:
- Keep annotations SHORT (5-10 words max)
- Focus on user's INTENT, not just what they said
- Consider the flow: what phase are they in? What are they trying to accomplish?
- Context matters: same words can be different colors depending on flow
  * "Let's add tests" after building = GREEN (new phase)
  * "Add more tests" while testing = YELLOW (expanding current work)

EXAMPLES:

Input:
[
  {index: 1, content: "Help me build a blog post generator from Claude Code sessions"},
  {index: 5, content: "Actually let's use gpt-5-nano instead of GPT-4"},
  {index: 12, content: "Great! Now let's add multiple blog templates"},
  {index: 18, content: "Can you also add a cost tracker?"},
  {index: 25, content: "This is way too complex. Let's simplify the whole thing."}
]

Output:
{
  "annotations": [
    {
      "messageIndex": 1,
      "content": "Help me build a blog post generator...",
      "annotation": "Starting new project: blog generator",
      "color": "green"
    },
    {
      "messageIndex": 5,
      "content": "Actually let's use gpt-5-nano...",
      "annotation": "Switching AI model for cost savings",
      "color": "yellow"
    },
    {
      "messageIndex": 12,
      "content": "Great! Now let's add multiple blog templates",
      "annotation": "Adding new feature: template system",
      "color": "green"
    },
    {
      "messageIndex": 18,
      "content": "Can you also add a cost tracker?",
      "annotation": "Extending templates with cost tracking",
      "color": "yellow"
    },
    {
      "messageIndex": 25,
      "content": "This is way too complex...",
      "annotation": "Major pivot: simplifying architecture",
      "color": "red"
    }
  ],
  "summary": "Building blog post generator with gpt-5-nano, added templates and cost tracking, then simplified due to complexity"
}

Respond with valid JSON only, no additional text.`;

export async function annotateUserMessages(
  client: OpenAIClient,
  messages: UserMessageInput[]
): Promise<AnnotationResult> {
  const userPrompt = buildUserPrompt(messages);

  const result = await client.callStructured<AnnotationResult>(
    'user-message-annotation',
    SYSTEM_PROMPT,
    userPrompt,
    {
      temperature: 0.3, // Lower temperature for consistent annotations
      maxTokens: 2000, // Enough for ~50 message annotations
    }
  );

  return result;
}

function buildUserPrompt(messages: UserMessageInput[]): string {
  const parts: string[] = [
    'Annotate these user messages from a Claude Code session:\n',
    'USER MESSAGES:',
  ];

  // Add each message with index
  messages.forEach((msg) => {
    // Truncate very long messages for token efficiency
    const content =
      msg.content.length > 300
        ? msg.content.slice(0, 300) + '...'
        : msg.content;
    parts.push(`${msg.index}. ${content}`);
  });

  parts.push(
    '\nRespond with JSON in this exact format:',
    '{',
    '  "annotations": [',
    '    {',
    '      "messageIndex": number,',
    '      "content": "original message text (truncated if needed)",',
    '      "annotation": "5-10 word explanation",',
    '      "color": "green|yellow|red"',
    '    }',
    '  ],',
    '  "summary": "Brief 1-2 sentence summary of the entire session flow"',
    '}'
  );

  return parts.join('\n');
}

/**
 * Extract user messages from raw session JSONL
 */
export function extractUserMessages(sessionMessages: any[]): UserMessageInput[] {
  const userMessages: UserMessageInput[] = [];
  let userMessageIndex = 0;

  sessionMessages.forEach((msg) => {
    // Only include actual user text messages (not tool results)
    if (
      msg.type === 'user' &&
      msg.message?.content &&
      typeof msg.message.content === 'string'
    ) {
      userMessages.push({
        index: userMessageIndex++,
        content: msg.message.content,
      });
    }
  });

  return userMessages;
}
