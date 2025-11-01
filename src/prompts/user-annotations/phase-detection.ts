/**
 * Phase Detection Prompt (Pass 1 for Option C)
 *
 * High-level analysis to identify task boundaries in user messages
 */

import { OpenAIClient } from '../../ai/client';

export interface UserMessagePhase {
  phaseId: number;
  phaseName: string; // e.g., "Initial Setup", "Adding Templates", "Debugging"
  messageIndices: number[]; // Which user messages belong to this phase
  description: string; // What the user was trying to accomplish
}

export interface PhaseDetectionResult {
  phases: UserMessagePhase[];
  taskBoundaries: number[]; // Message indices where new tasks start (green candidates)
}

const SYSTEM_PROMPT = `You are an expert at identifying task boundaries in software development sessions.

Your task: Analyze user messages and identify distinct phases/tasks.

WHAT IS A PHASE?
A phase is a cohesive unit of work where the user is focused on ONE goal:
- "Initial project setup"
- "Adding template system"
- "Debugging model configuration"
- "Preparing for deployment"

TASK BOUNDARIES (Green candidates):
These are messages where the user:
- Starts a completely new feature or task
- Shifts to a different area of work
- Says things like "Now let's...", "Next, we should...", "Great! Let's move on to..."

NOT task boundaries (Yellow/Red candidates):
- Clarifications within same task
- Minor corrections or additions
- Asking follow-up questions about current work
- Providing more context for ongoing task

EXAMPLES:

Input:
[
  {index: 0, content: "Help me build a blog generator"},
  {index: 1, content: "Actually use gpt-4o-mini, not GPT-4"},
  {index: 2, content: "Can you also add cost tracking?"},
  {index: 3, content: "Great! Now let's add multiple templates"},
  {index: 4, content: "The template system isn't working, fix it"},
  {index: 5, content: "Perfect. Now create a README"}
]

Output:
{
  "phases": [
    {
      "phaseId": 1,
      "phaseName": "Initial Setup & Core Feature",
      "messageIndices": [0, 1, 2],
      "description": "Setting up blog generator with cost tracking"
    },
    {
      "phaseId": 2,
      "phaseName": "Template System",
      "messageIndices": [3, 4],
      "description": "Adding and debugging multiple templates"
    },
    {
      "phaseId": 3,
      "phaseName": "Documentation",
      "messageIndices": [5],
      "description": "Creating project documentation"
    }
  ],
  "taskBoundaries": [0, 3, 5]
}

Respond with valid JSON only, no additional text.`;

export async function detectPhases(
  client: OpenAIClient,
  messages: Array<{ index: number; content: string }>
): Promise<PhaseDetectionResult> {
  const userPrompt = buildUserPrompt(messages);

  const result = await client.callStructured<PhaseDetectionResult>(
    'phase-detection',
    SYSTEM_PROMPT,
    userPrompt,
    {
      temperature: 0.3,
      maxTokens: 1000,
    }
  );

  return result;
}

function buildUserPrompt(
  messages: Array<{ index: number; content: string }>
): string {
  const parts: string[] = [
    'Identify phases and task boundaries in these user messages:\n',
    'USER MESSAGES:',
  ];

  messages.forEach((msg) => {
    const content =
      msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content;
    parts.push(`${msg.index}. ${content}`);
  });

  parts.push(
    '\nRespond with JSON in this exact format:',
    '{',
    '  "phases": [',
    '    {',
    '      "phaseId": number,',
    '      "phaseName": "descriptive name",',
    '      "messageIndices": [array of message indices],',
    '      "description": "what user was trying to accomplish"',
    '    }',
    '  ],',
    '  "taskBoundaries": [array of message indices where new tasks start]',
    '}'
  );

  return parts.join('\n');
}
