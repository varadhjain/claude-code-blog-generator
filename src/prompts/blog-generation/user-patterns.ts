/**
 * User Patterns Analyzer
 *
 * Detects how the USER behaved in the session.
 * The story is about human + Claude Code interaction, not just the LLM.
 */

import { OpenAIClient } from '../../ai/client';
import { SessionDigest } from '../../analyzer/blog-generation/digest-builder';

export type SessionArchetype =
  | 'one-shot'
  | 'iterative-refinement'
  | 'directive'
  | 'exploratory'
  | 'struggling'
  | 'collaborative';

export interface UserPatterns {
  archetype: SessionArchetype;
  description: string;
  user_message_count: number;
  user_behavior: {
    clarity: 'very-clear' | 'clear' | 'vague' | 'evolving'; // How clear were user instructions?
    engagement: 'hands-off' | 'guided' | 'hands-on'; // How much did user steer?
    patience: 'patient' | 'iterative' | 'frustrated'; // How did user handle issues?
  };
  notable_patterns: string[]; // 2-3 specific observations about user behavior
}

const SYSTEM_PROMPT = `You are an expert at analyzing how humans use AI coding assistants.

Your task: Analyze USER behavior patterns in this Claude Code session.

FOCUS ON THE HUMAN, NOT THE AI:
- How clear were the user's instructions?
- Did they provide one big request or iterate?
- How did they handle problems?
- What does their message pattern reveal?

SESSION ARCHETYPES:

**one-shot**: User sent 1-2 messages, Claude Code delivered complete solution
  - Very clear initial request
  - Minimal follow-up
  - User trusted Claude Code completely

**iterative-refinement**: User sent many small corrections/adjustments
  - "Try this", "Actually, change that", "Almost there"
  - Gradual convergence to solution
  - User as director, Claude Code as implementer

**directive**: User gave specific, technical instructions throughout
  - "Use this library", "Follow this pattern"
  - Low-level control
  - User knew exactly what they wanted

**exploratory**: User asked questions, learned as they went
  - "What if...", "How does X work?"
  - Lots of reading, searching
  - User discovering alongside Claude Code

**struggling**: User hit repeated problems, errors, blockers
  - Multiple failed attempts
  - Frustration indicators: "still not working", "why is this..."
  - Debugging-heavy session

**collaborative**: User and Claude Code working as partners
  - Frequent questions and answers
  - Joint problem-solving
  - Back-and-forth decision making

USER BEHAVIOR SIGNALS:

**Clarity**:
- very-clear: Detailed, specific initial request
- clear: Good description, some ambiguity
- vague: "Build me something", unclear requirements
- evolving: User figured out what they wanted during session

**Engagement**:
- hands-off: "Build X" then disappeared, came back at end
- guided: Provided direction at key moments
- hands-on: Constant feedback and steering

**Patience**:
- patient: Calm, methodical, no rush
- iterative: Quick back-and-forth, building incrementally
- frustrated: "This isn't working", repeated attempts

EXAMPLES:

✅ GOOD - Focuses on user:
{
  "archetype": "one-shot",
  "description": "User provided extremely detailed initial request with acceptance criteria, then stepped back while Claude Code implemented everything. Single follow-up to confirm completion.",
  "user_message_count": 2,
  "user_behavior": {
    "clarity": "very-clear",
    "engagement": "hands-off",
    "patience": "patient"
  },
  "notable_patterns": [
    "User wrote 300-word initial request with bullet points and examples",
    "Zero corrections needed - Claude Code got it right first try",
    "User trusted the process completely"
  ]
}

✅ GOOD - Shows struggle:
{
  "archetype": "struggling",
  "description": "User repeatedly hit TypeScript errors, tried 4 different approaches before finding solution. Frustration visible in messages.",
  "user_message_count": 23,
  "user_behavior": {
    "clarity": "evolving",
    "engagement": "hands-on",
    "patience": "frustrated"
  },
  "notable_patterns": [
    "User said 'still broken' 3 times across messages 45, 67, 89",
    "Each attempt tried different library (axios → fetch → ky → got)",
    "Finally solved by reading docs together with Claude Code"
  ]
}

❌ BAD - Focuses on AI:
{
  "archetype": "one-shot",
  "description": "Claude Code was very fast and efficient"
}

Respond with valid JSON only.`;

export async function analyzeUserPatterns(
  client: OpenAIClient,
  digest: SessionDigest,
  userMessages: string[] // Raw user message text for analysis
): Promise<UserPatterns> {
  const userPrompt = buildUserPrompt(digest, userMessages);

  const result = await client.callStructured<UserPatterns>(
    'user-patterns',
    SYSTEM_PROMPT,
    userPrompt,
    {
      maxTokens: 4000,
    }
  );

  return result;
}

function buildUserPrompt(digest: SessionDigest, userMessages: string[]): string {
  const parts: string[] = ['Analyze USER behavior in this session:\n'];

  parts.push('## SESSION STATS');
  parts.push(`Duration: ~${digest.session_stats.duration_estimate_minutes} minutes`);
  parts.push(`Total messages: ${digest.session_stats.total_messages}`);
  parts.push(`User messages: ${userMessages.length}\n`);

  // User messages (the most important signal!)
  parts.push('## USER MESSAGES (Focus Here!)');
  parts.push('These are the actual user messages. Analyze their patterns:\n');
  userMessages.slice(0, 15).forEach((msg, i) => {
    const preview = msg.slice(0, 200);
    parts.push(`Message ${i + 1}: ${preview}${msg.length > 200 ? '...' : ''}\n`);
  });

  if (userMessages.length > 15) {
    parts.push(`... and ${userMessages.length - 15} more user messages\n`);
  }

  // Tool patterns (secondary signal - shows what Claude Code did in response)
  parts.push('## CLAUDE CODE TOOLS USED (Context)');
  digest.tool_summary.slice(0, 8).forEach((t) => {
    parts.push(`- ${t.tool_name}: ${t.count}x`);
  });
  parts.push('');

  // Phase transitions (shows flow)
  if (digest.phase_transitions.length > 0) {
    parts.push('## PHASE TRANSITIONS');
    digest.phase_transitions.forEach((t) => {
      parts.push(`- Message ${t.message_index}: ${t.indicator}`);
    });
    parts.push('');
  }

  parts.push('---\n');
  parts.push('Analyze USER patterns in JSON format:');
  parts.push('{');
  parts.push('  "archetype": "one-shot|iterative-refinement|directive|exploratory|struggling|collaborative",');
  parts.push('  "description": "2-3 sentences about how the USER behaved",');
  parts.push('  "user_message_count": <number>,');
  parts.push('  "user_behavior": {');
  parts.push('    "clarity": "very-clear|clear|vague|evolving",');
  parts.push('    "engagement": "hands-off|guided|hands-on",');
  parts.push('    "patience": "patient|iterative|frustrated"');
  parts.push('  },');
  parts.push('  "notable_patterns": [');
  parts.push('    "2-3 specific observations about USER behavior (not AI behavior)"');
  parts.push('  ]');
  parts.push('}');

  return parts.join('\n');
}
