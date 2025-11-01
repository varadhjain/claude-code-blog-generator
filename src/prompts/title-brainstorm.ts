/**
 * Title Brainstormer
 *
 * Generates potential blog post titles based on session content and chosen angle.
 */

import { OpenAIClient } from '../ai/client';
import { InterestingMoment } from './interesting-moments';

export interface TitleOptions {
  titles: Array<{
    title: string;
    style: string; // e.g., "question", "how-to", "declaration", "number-based"
    appeal: string; // why this title works
  }>;
}

const SYSTEM_PROMPT = `You are an expert at writing catchy, informative blog post titles for technical content.

Your task: Generate 8-10 potential blog post titles for a coding session.

GOOD TITLE CHARACTERISTICS:
- **Specific**: Mentions concrete technologies or outcomes
- **Intriguing**: Makes reader curious
- **Clear value**: Obvious what they'll learn
- **Honest**: Doesn't overpromise

TITLE STYLES TO USE:
1. **How-to**: "How to Build X in Y Minutes"
2. **Numbered**: "5 Things I Learned Building X"
3. **Question**: "What Happens When You Build X?"
4. **Declaration**: "Building X: A Y Approach"
5. **Journey**: "From Idea to Implementation: Building X"
6. **Pattern**: "The Z Pattern for Building X"
7. **Discovery**: "I Discovered X While Building Y"

EXAMPLES OF GOOD TITLES:
✅ "Building a TypeScript Parser in 37 Minutes"
✅ "Documentation-First Development: Why I Write Docs Before Code"
✅ "How I Reduced AI Costs by 85% with a Two-Stage Pipeline"
✅ "3 Unusual Patterns from a Fast-Paced Coding Sprint"
✅ "What I Learned Fighting with gpt-5-nano's API"

BAD TITLES:
❌ "My Coding Session" (too vague)
❌ "You Won't BELIEVE What Happened!" (clickbait)
❌ "The Ultimate Guide to Everything" (overpromise)

Respond with valid JSON only.`;

export async function brainstormTitles(
  client: OpenAIClient,
  sessionGoal: string,
  interestingMoments: InterestingMoment[],
  chosenAngle?: string
): Promise<TitleOptions> {
  const userPrompt = buildUserPrompt(sessionGoal, interestingMoments, chosenAngle);

  const result = await client.callStructured<TitleOptions>(
    'title-brainstorm',
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: 8000, // Increased for gpt-5-nano reasoning model
    }
  );

  return result;
}

function buildUserPrompt(
  sessionGoal: string,
  moments: InterestingMoment[],
  angle?: string
): string {
  const parts: string[] = ['Generate blog post titles for this session:\n'];

  parts.push('## SESSION GOAL');
  parts.push(sessionGoal + '\n');

  parts.push('## INTERESTING MOMENTS');
  moments.forEach((m, i) => {
    parts.push(`${i + 1}. **${m.title}**`);
    parts.push(`   ${m.description}`);
    parts.push(`   Why interesting: ${m.why_interesting}\n`);
  });

  if (angle) {
    parts.push('## CHOSEN ANGLE');
    parts.push(`User wants to focus on: ${angle}\n`);
  }

  parts.push('---\n');
  parts.push('Generate 8-10 potential titles in JSON format:');
  parts.push('{');
  parts.push('  "titles": [');
  parts.push('    {');
  parts.push('      "title": "the blog post title",');
  parts.push('      "style": "how-to|numbered|question|declaration|journey|pattern|discovery",');
  parts.push('      "appeal": "why this title works"');
  parts.push('    }');
  parts.push('  ]');
  parts.push('}');

  return parts.join('\n');
}
