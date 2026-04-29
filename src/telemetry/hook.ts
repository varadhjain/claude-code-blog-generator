/**
 * `ccblog telemetry-hook` — Claude Code PostToolUse hook implementation.
 *
 * Wire into ~/.claude/settings.json:
 *   {
 *     "hooks": {
 *       "PostToolUse": [
 *         { "matcher": "Skill", "hooks": [{ "type": "command", "command": "ccblog telemetry-hook" }] }
 *       ]
 *     }
 *   }
 *
 * Reads the hook event JSON from stdin, appends one line to
 * ~/.ccblog/telemetry/skills.jsonl. Fails silently on any error — telemetry
 * must NEVER block the user's tool calls.
 *
 * Output schema (one JSON object per line):
 *   { ts, session_id, project_path, tool_name, skill_name, args_summary }
 *
 * `args_summary` is a short string — never the full args (which may contain
 * file contents or PII). For Skill, we capture skill name + a truncated
 * args string.
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = path.join(process.env.HOME!, '.ccblog', 'telemetry');
const LOG_PATH = path.join(LOG_DIR, 'skills.jsonl');

interface HookEvent {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
}

export async function runTelemetryHook(): Promise<void> {
  // Hooks are noisy by design — never let them break the user's flow.
  try {
    const raw = await readStdin();
    if (!raw.trim()) return;
    const evt: HookEvent = JSON.parse(raw);

    // Only record Skill invocations for now. Easy to extend by removing
    // this guard or wiring more matchers in settings.json.
    if (evt.tool_name !== 'Skill') return;

    const skillName = typeof evt.tool_input?.skill === 'string' ? evt.tool_input.skill : '';
    const argsRaw = typeof evt.tool_input?.args === 'string' ? evt.tool_input.args : '';
    const argsSummary = argsRaw.slice(0, 120);

    const line = JSON.stringify({
      ts: new Date().toISOString(),
      session_id: evt.session_id ?? null,
      project_path: evt.cwd ?? null,
      tool_name: evt.tool_name,
      skill_name: skillName,
      args_summary: argsSummary,
    });

    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line + '\n');
  } catch {
    // swallow — telemetry must not block tool calls
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    if (process.stdin.isTTY) { resolve(''); return; }
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(''));
    // Hard cap — if no end signal in 2s, just stop reading.
    setTimeout(() => resolve(data), 2000).unref();
  });
}
