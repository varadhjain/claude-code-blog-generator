import type { Source } from '../search/indexer';

export interface Turn {
  id?: string;
  line: number;
  cwd: string;
  started: number;
  model?: string;
  status?: 'completed' | 'cancelled';
  duration?: number;
  followup?: { line: number; text: string };
}

type Entry = Record<string, any>;

function humanText(content: unknown): string | undefined {
  const blocks = Array.isArray(content) ? content : [{ type: 'text', text: content }];
  if (blocks.some(block => block?.type === 'tool_result')) return;
  const text = blocks.filter(block => ['text', 'input_text'].includes(block?.type) && typeof block.text === 'string')
    .map(block => block.text.trim())
    .filter(text => text && !/^(?:# AGENTS\.md instructions|# Files mentioned by the|<(?:environment_context|system-reminder|local-command|command-|task-notification|\/?image\b)|This session is being continued)/i.test(text))
    .join('\n');
  return text || undefined;
}

export function readTurns(source: Source, cwd: string) {
  const turns: Turn[] = [];
  const codexTurns = new Map<string, Turn>();
  const claudeLineage = new Map<string, Turn | undefined>();
  const claudeModels = new WeakMap<Turn, Set<string>>();
  let active: Turn | undefined;
  let previousCodex: Turn | undefined;
  let codexPromptSeen = false;

  function codex(row: Entry, line: number, time: number) {
    const payload = row.payload;
    if (!payload || (payload.root_turn_id && payload.root_turn_id !== payload.turn_id)) return;
    const turnId = payload.turn_id;
    if (row.type === 'event_msg' && payload.type === 'task_started' && typeof turnId === 'string') {
      if (codexTurns.has(turnId) || !Number.isFinite(time) || payload.turn_attribution?.parent_turn_id) return;
      previousCodex = active;
      active = { id: turnId, line, cwd, started: time };
      codexPromptSeen = false;
      codexTurns.set(turnId, active);
      turns.push(active);
    } else if (row.type === 'turn_context') {
      const turn = codexTurns.get(turnId);
      if (turn) {
        if (typeof payload.cwd === 'string') turn.cwd = payload.cwd;
        if (typeof payload.model === 'string') turn.model = payload.model;
      }
    } else if (row.type === 'event_msg' && ['task_complete', 'turn_aborted'].includes(payload.type)) {
      const turn = codexTurns.get(turnId);
      if (!turn || turn.status) return;
      if (payload.type === 'turn_aborted') {
        if (['interrupted', 'cancelled', 'canceled'].includes(String(payload.reason).toLowerCase())) turn.status = 'cancelled';
      } else {
        turn.status = 'completed';
        const duration = payload.duration_ms ?? time - turn.started;
        if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0) turn.duration = duration;
      }
    } else if (row.type === 'response_item' && payload.type === 'message' && payload.role === 'user' &&
               active && !active.status && !codexPromptSeen) {
      const text = humanText(payload.content);
      if (!text) return;
      codexPromptSeen = true;
      if (previousCodex?.status === 'completed' && previousCodex.cwd === active.cwd) {
        previousCodex.followup = { line, text };
      }
    }
  }

  function claude(row: Entry, line: number, time: number) {
    if (row.isSidechain || !['assistant', 'user'].includes(row.type) || !row.message) return;
    // An explicit parent is authoritative after a fork or resume.
    const parent = typeof row.parentUuid === 'string' ? claudeLineage.get(row.parentUuid) :
      row.parentUuid === null ? undefined : active;
    const message = row.message;
    let turn = parent;
    if (row.type === 'user') {
      const blocks = Array.isArray(message.content) ? message.content : [{ text: message.content }];
      const interrupted = blocks.some((block: Entry) =>
        typeof block?.text === 'string' && /^\[Request interrupted by user(?: for tool use)?\]\s*$/i.test(block.text));
      if (interrupted && turn && !turn.status) {
        turn.status = 'cancelled';
      } else if (!row.isMeta && !row.isCompactSummary && !row.toolUseResult &&
                 (!row.promptSource || row.promptSource === 'typed') &&
                 (!row.turnOrigin || row.turnOrigin === 'human')) {
        const text = interrupted ? undefined : humanText(message.content);
        if (text && Number.isFinite(time)) {
          turn = {
            id: typeof row.uuid === 'string' ? row.uuid : undefined,
            line, cwd: typeof row.cwd === 'string' ? row.cwd : cwd, started: time,
          };
          if (parent?.status === 'completed' && parent.cwd === turn.cwd && !parent.followup) parent.followup = { line, text };
          turns.push(turn);
          claudeModels.set(turn, new Set());
        }
      }
    } else if (turn && !turn.status && message.model !== '<synthetic>' && !row.isApiErrorMessage) {
      const models = claudeModels.get(turn);
      if (typeof message.model === 'string' && message.model) models?.add(message.model);
      turn.model = models?.size === 1 ? models.values().next().value : undefined;
      if (['end_turn', 'stop_sequence'].includes(message.stop_reason)) {
        turn.status = 'completed';
        if (time >= turn.started) turn.duration = time - turn.started;
      }
    }
    active = turn;
    if (typeof row.uuid === 'string') claudeLineage.set(row.uuid, turn);
  }

  return {
    turns,
    add(row: Entry, line: number) {
      const time = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN;
      if (source === 'codex') codex(row, line, time);
      else claude(row, line, time);
    },
  };
}

// Observable phrases only. A text follow-up without a match is simply unflagged.
export const reactionPatterns = {
  correction: /\b(?:not what i (?:mean|meant|asked(?: for)?|wanted)|you misunderstood|what i meant was|i meant to say|no[,—-]\s+i meant)\b/i,
  broken: /\b(?:still (?:broken|fails?|failing|doesn['’]t work|not (?:fixed|working)|getting the same (?:error|result))|that (?:broke|didn['’]t work))\b/i,
  undo: /\b(?:undo|revert) (?:that|this|the (?:last )?changes?|your changes?)\b|\b(?:roll (?:that|it) back|put it back the way it was|remove that change)\b/i,
};
