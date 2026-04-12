/**
 * Decision Point Detection Prompt
 *
 * Identifies key technical decisions made during the session
 */

import { OpenAIClient } from '../../ai/client';

export interface DecisionContext {
  message_window: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  phase?: string;
  tools_used?: string[];
}

export interface DecisionPoint {
  is_decision_point: boolean;
  decision?: string;
  reasoning?: string;
  alternatives_considered?: string[];
  impact?: 'low' | 'medium' | 'high';
  category?: string; // e.g., "architecture", "library choice", "implementation approach"
}

const SYSTEM_PROMPT = `You are an expert at identifying key technical decision points in software development conversations.

Your task is to analyze a message window and determine if a significant technical decision was made.

WHAT COUNTS AS A DECISION POINT:
✅ Technology/library choices ("should we use Redux or Context?")
✅ Architecture decisions ("let's go with microservices")
✅ Implementation approaches ("use recursion instead of iteration")
✅ Trade-off evaluations ("TypeScript for type safety despite extra setup")
✅ Process choices ("write tests first", "documentation before code")

WHAT DOES NOT COUNT:
❌ Simple clarifications ("yes, that looks good")
❌ Minor syntax choices (const vs let)
❌ Confirming next steps ("ok, let's continue")
❌ Routine tool usage ("I'll use Read to check that file")

KEY SIGNALS:
- Questions with alternatives: "should we A or B?"
- Explicit choices: "let's go with X"
- Trade-off language: "X is better because..."
- AskUserQuestion tool usage
- Phrases like: "I prefer", "let's use", "better to", "instead of"

IMPACT LEVELS:
- HIGH: Affects entire architecture, hard to change later (database choice, framework)
- MEDIUM: Affects multiple components, moderate effort to change (state management, testing approach)
- LOW: Affects one component, easy to change (naming convention, folder structure)

Respond with valid JSON only.`;

export async function detectDecision(
  client: OpenAIClient,
  context: DecisionContext
): Promise<DecisionPoint> {
  const userPrompt = buildUserPrompt(context);

  const result = await client.callStructured<DecisionPoint>(
    'decision-detection',
    SYSTEM_PROMPT,
    userPrompt,
    {
      temperature: 0.4,
      maxTokens: 2500,
    }
  );

  return result;
}

function buildUserPrompt(context: DecisionContext): string {
  const parts: string[] = ['Analyze this message window for decision points:\n'];

  if (context.phase) {
    parts.push(`PHASE: ${context.phase}`);
  }

  if (context.tools_used && context.tools_used.length > 0) {
    parts.push(`TOOLS USED: ${context.tools_used.join(', ')}`);
  }

  parts.push('\nMESSAGES:');
  context.message_window.forEach((msg, idx) => {
    const preview = msg.content.slice(0, 400);
    parts.push(`${idx + 1}. ${msg.role.toUpperCase()}: ${preview}`);
  });

  parts.push(
    '\nRespond with JSON in this format:',
    '{',
    '  "is_decision_point": true|false,',
    '  "decision": "what was decided (if any)",',
    '  "reasoning": "why this decision was made",',
    '  "alternatives_considered": ["option 1", "option 2"],',
    '  "impact": "low|medium|high",',
    '  "category": "e.g., library choice, architecture, implementation approach"',
    '}',
    '',
    'If is_decision_point is false, the other fields are optional.'
  );

  return parts.join('\n');
}

/**
 * Pre-filter to identify likely decision points before calling LLM
 * This saves API calls by only checking messages that likely contain decisions
 */
export function isLikelyDecisionPoint(messages: any[]): boolean {
  const decisionPatterns = [
    /should\s+(we|I)/i,
    /could\s+(we|I)/i,
    /would\s+(you|we)/i,
    /let'?s\s+(use|go\s+with|choose)/i,
    /instead\s+of/i,
    /better\s+(to|than)/i,
    /prefer/i,
    /or\s+should/i,
    /which\s+(one|approach|library|framework)/i,
  ];

  const text = messages
    .map((m) => {
      if (typeof m.message?.content === 'string') {
        return m.message.content;
      }
      if (Array.isArray(m.message?.content)) {
        return m.message.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join(' ');
      }
      return '';
    })
    .join(' ');

  // Check if any pattern matches
  for (const pattern of decisionPatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  // Also check if AskUserQuestion tool was used
  for (const msg of messages) {
    if (msg.type === 'assistant' && msg.message?.content) {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use' && block.name === 'AskUserQuestion') {
            return true;
          }
        }
      }
    }
  }

  return false;
}
