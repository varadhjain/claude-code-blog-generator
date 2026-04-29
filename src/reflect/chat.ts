/**
 * `ccblog reflect --chat` — REPL on top of the digest + reflection.
 *
 * The OpenAI client is single-turn (system + user). We simulate multi-turn by
 * appending the running history to each new user prompt. With ~25k digest
 * tokens + ~3k reflection + a handful of turns, gpt-5-nano (400k context) and
 * Claude Haiku (200k) both have plenty of room.
 */

import { input } from '@inquirer/prompts';
import { OpenAIClient } from '../ai/client';
import type { Tone } from './prompt';

export interface ChatContext {
  digestMarkdown: string;
  reflection: string;
  tone: Tone;
  priorReflection?: string;
}

const CHAT_SYSTEM = `
You are continuing a reflection conversation with the developer about their recent Claude Code work.

You have already produced the structured retrospective shown below. Now the developer wants to discuss it.

RULES (still apply):
1. Every factual claim about their work must cite a session via [sid:msg#] tags from the digest. NO ungrounded claims.
2. If asked about something the digest doesn't cover, SAY SO clearly — do not fabricate.
3. Be specific. Quote actual prompts or assistant responses when relevant.
4. Push back if the developer disputes something the evidence supports — restate the evidence rather than capitulating.
5. Keep responses tight. Bullets > prose. No preambles.
6. The developer can end the chat by typing /quit or just sending an empty message.
`.trim();

function buildChatPrompt(ctx: ChatContext, history: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  const sections: string[] = [];
  sections.push('=== DIGEST ===');
  sections.push(ctx.digestMarkdown);
  sections.push('');
  sections.push('=== STRUCTURED REFLECTION (already produced) ===');
  sections.push(ctx.reflection);
  if (ctx.priorReflection) {
    sections.push('');
    sections.push('=== PRIOR REFLECTION (for comparative context) ===');
    sections.push(ctx.priorReflection);
  }
  sections.push('');
  sections.push('=== CONVERSATION SO FAR ===');
  if (history.length === 0) {
    sections.push('(none yet — this is the first turn)');
  } else {
    for (const turn of history) {
      sections.push(`${turn.role === 'user' ? 'YOU' : 'ME'}: ${turn.content}`);
    }
  }
  sections.push('');
  sections.push('Respond to the latest YOU turn above. Do not echo the prior conversation.');
  return sections.join('\n');
}

/**
 * Returns a markdown-formatted transcript of the chat (or null if user
 * exited without saying anything). Caller appends it to the artifact.
 */
export async function runChat(client: OpenAIClient, ctx: ChatContext): Promise<string | null> {
  console.log('');
  console.log('💬 Chat mode — discuss the reflection. Empty line or /quit to exit.');
  console.log('   Tip: ask "show me the actual exchange in [sid]" or "expand on pattern N".');
  console.log('');

  const history: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  while (true) {
    let userMessage: string;
    try {
      userMessage = await input({ message: 'you ›' });
    } catch {
      // Ctrl-C / EOF
      break;
    }
    const trimmed = userMessage.trim();
    if (!trimmed || trimmed === '/quit' || trimmed === '/exit') break;

    history.push({ role: 'user', content: trimmed });

    let reply: string;
    try {
      reply = await client.callText(
        'reflect-chat',
        CHAT_SYSTEM,
        buildChatPrompt(ctx, history),
        { maxTokens: 8000, temperature: 0.5 },
      );
    } catch (err) {
      console.error(`\n⚠️  ${(err as Error).message}\n`);
      // Drop the user turn we just added so retries don't see a dangling message.
      history.pop();
      continue;
    }

    history.push({ role: 'assistant', content: reply.trim() });
    console.log(`\n${reply.trim()}\n`);
  }

  if (history.length === 0) return null;

  const lines: string[] = [];
  for (const turn of history) {
    if (turn.role === 'user') {
      lines.push(`**You:** ${turn.content}`);
    } else {
      lines.push('');
      lines.push(turn.content);
      lines.push('');
    }
  }
  return lines.join('\n');
}
