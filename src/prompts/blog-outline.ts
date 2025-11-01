/**
 * Blog Outline Generator
 *
 * Creates a complete blog post outline ready for writing.
 * Driven by user intent and session highlights.
 */

import { OpenAIClient } from '../ai/client';
import { SessionDigest } from '../analyzer/digest-builder';
import { UserIntent } from './user-intent';
import { Highlights } from './highlights-extraction';

export interface BlogSection {
  heading: string;
  subsections?: string[];
  content_notes: string; // What to cover in this section
  message_refs?: number[]; // Which messages to reference
}

export interface BlogOutline {
  hook: string; // Opening paragraph idea
  sections: BlogSection[];
  conclusion_notes: string; // How to wrap up
  estimated_word_count: number;
}

const SYSTEM_PROMPT = `You are an expert at structuring technical blog posts about AI-assisted coding.

Your task: Create a complete blog post outline from a Claude Code session.

The blog post tells the story of HOW A HUMAN used Claude Code, not just what the AI did.

OUTLINE STRUCTURE:

**Hook (1 paragraph)**:
- Grab attention with the key insight or outcome
- Set up the story
- Examples:
  - "I built a production-ready TypeScript project in 37 minutes. Here's how."
  - "After three failed attempts, I finally understood why my API calls were failing. The culprit? A single missing header."

**Main Sections (3-5)**:
Each section should:
- Have a clear, descriptive heading
- Include subsections if needed
- Specify what content/examples to include
- Link to relevant message ranges

**Section Types**:

*For one-shot-success angle*:
1. The Setup: What I wanted to build
2. The Request: How I structured my initial message
3. The Result: What Claude Code delivered
4. Why It Worked: Keys to successful one-shot prompts

*For debugging-struggle angle*:
1. The Problem: What went wrong
2. First Attempts: What I tried and why it failed
3. The Breakthrough: How we finally solved it
4. Lessons Learned: What this taught me

*For workflow-patterns angle*:
1. My Approach: How I structured the session
2. Key Techniques: Specific patterns I used
3. What Worked Well: Successes and wins
4. Takeaways: Reusable techniques for others

*For speed-efficiency angle*:
1. The Goal: What I built
2. The Process: How we moved so fast
3. The Result: What got delivered
4. Speed Factors: What enabled the velocity

*For learning-new-tech angle*:
1. Starting Point: What I didn't know
2. The Exploration: How Claude Code helped me learn
3. Key Discoveries: Concepts I understood
4. The Implementation: Putting it into practice

**Conclusion (1-2 paragraphs)**:
- Summarize the key takeaway
- Broader lesson about using Claude Code
- Call to action (try this yourself, etc.)

EXAMPLES:

✅ GOOD - Clear structure for debugging story:
{
  "hook": "Open with the frustration: 'Still broken.' I'd typed those words three times in 20 minutes. But the fourth attempt would finally reveal what was really going wrong.",
  "sections": [
    {
      "heading": "The Problem: CORS Errors That Made No Sense",
      "content_notes": "Describe initial error. Show the fetch call. Explain why it seemed like it should work.",
      "message_refs": [12, 15]
    },
    {
      "heading": "Three Failed Attempts",
      "subsections": ["Try 1: Adding CORS headers", "Try 2: Switching to axios", "Try 3: Proxy config"],
      "content_notes": "Walk through each attempt. Show what changed. Explain why each failed. Build tension.",
      "message_refs": [20, 35, 67]
    },
    {
      "heading": "The Breakthrough: It Was Never CORS",
      "content_notes": "Reveal the actual issue (proxy misconfiguration). Show the fix. Explain the aha moment.",
      "message_refs": [89, 92]
    },
    {
      "heading": "What I Learned About Debugging with Claude Code",
      "content_notes": "Systematic exploration helps. Don't assume the obvious answer. Check fundamentals last.",
      "message_refs": []
    }
  ],
  "conclusion_notes": "Debugging isn't linear. Claude Code helps you explore systematically. The lesson: when nothing works, question your assumptions.",
  "estimated_word_count": 1200
}

✅ GOOD - One-shot success structure:
{
  "hook": "I typed one message. 300 words, detailed requirements, clear acceptance criteria. 15 minutes later: a working TypeScript CLI tool with zero bugs. Here's what made it work.",
  "sections": [
    {
      "heading": "The 300-Word Prompt That Changed Everything",
      "content_notes": "Show the actual prompt structure. Explain the key elements: context, requirements, acceptance criteria, constraints.",
      "message_refs": [1]
    },
    {
      "heading": "What Claude Code Delivered",
      "content_notes": "List the outputs: files, config, tests. Show the completeness. No back-and-forth needed.",
      "message_refs": [1, 25]
    },
    {
      "heading": "The Anatomy of a Perfect One-Shot Prompt",
      "subsections": ["Be specific", "Include examples", "State constraints upfront", "Define success clearly"],
      "content_notes": "Break down what made this work. Give reusable template.",
      "message_refs": []
    }
  ],
  "conclusion_notes": "One-shot success isn't luck. It's clarity. Invest 5 minutes in your prompt, save 30 minutes in back-and-forth.",
  "estimated_word_count": 800
}

Keep sections FOCUSED and ACTIONABLE. Message refs help link back to source.

Respond with valid JSON only.`;

export async function generateBlogOutline(
  client: OpenAIClient,
  digest: SessionDigest,
  userIntent: UserIntent,
  highlights: Highlights,
  titles: string[]
): Promise<BlogOutline> {
  const userPrompt = buildUserPrompt(digest, userIntent, highlights, titles);

  const result = await client.callStructured<BlogOutline>(
    'blog-outline',
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: 6000,
    }
  );

  return result;
}

function buildUserPrompt(
  digest: SessionDigest,
  userIntent: UserIntent,
  highlights: Highlights,
  titles: string[]
): string {
  const parts: string[] = ['Create a blog post outline for this session:\n'];

  parts.push('## USER INTENT');
  parts.push(`Angle: ${userIntent.angle}`);
  if (userIntent.custom_description) {
    parts.push(`Description: ${userIntent.custom_description}`);
  }
  parts.push(`Target audience: ${userIntent.target_audience}`);
  parts.push(`Focus areas: ${userIntent.focus_areas.join(', ')}\n`);

  parts.push('## POTENTIAL TITLES');
  titles.forEach((t, i) => parts.push(`${i + 1}. "${t}"`));
  parts.push('');

  parts.push('## SESSION SUMMARY');
  parts.push(`One-liner: ${highlights.one_liner}`);
  parts.push(`Duration: ~${digest.session_stats.duration_estimate_minutes} minutes`);
  parts.push(`Messages: ${digest.session_stats.total_messages}\n`);

  parts.push('## KEY HIGHLIGHTS');
  highlights.highlights.forEach((h, i) => {
    parts.push(`${i + 1}. **${h.title}**`);
    parts.push(`   ${h.what}`);
    parts.push(`   Why notable: ${h.why_notable}`);
    if (h.message_range) {
      parts.push(`   Messages: ${h.message_range[0]}-${h.message_range[1]}`);
    }
    parts.push('');
  });

  parts.push('## PHASE TRANSITIONS');
  if (digest.phase_transitions.length > 0) {
    digest.phase_transitions.forEach((t) => {
      parts.push(`- Message ${t.message_index}: ${t.indicator}`);
    });
  } else {
    parts.push('(No clear phase transitions - likely smooth session)');
  }
  parts.push('');

  parts.push('---\n');
  parts.push('Create blog outline in JSON format:');
  parts.push('{');
  parts.push('  "hook": "opening paragraph idea (1-2 sentences)",');
  parts.push('  "sections": [');
  parts.push('    {');
  parts.push('      "heading": "section heading",');
  parts.push('      "subsections": ["optional", "subsections"],');
  parts.push('      "content_notes": "what to cover in this section",');
  parts.push('      "message_refs": [message numbers to reference]');
  parts.push('    }');
  parts.push('  ],');
  parts.push('  "conclusion_notes": "how to wrap up the post",');
  parts.push('  "estimated_word_count": <number>');
  parts.push('}');

  return parts.join('\n');
}
