import { createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { sessionScope, walkAll, type Source } from '../search/indexer';
import { readTurns, type Turn } from './turns';

export interface Observation extends Turn {
  file: string;
  source: Source;
}

function agreed<T>(values: Array<T | undefined>) {
  const known = new Set(values.filter(value => value !== undefined));
  return known.size === 1 ? known.values().next().value : undefined;
}

function mergeCopies(copies: Observation[]): Observation {
  if (copies.length === 1) return copies[0];
  const chosen = copies.find(copy => copy.followup) ?? copies[0];
  const followup = agreed(copies.map(copy => copy.followup?.text));
  return {
    ...chosen,
    model: agreed(copies.map(copy => copy.model)),
    status: agreed(copies.map(copy => copy.status)),
    duration: agreed(copies.map(copy => copy.duration)),
    prompt: agreed(copies.map(copy => copy.prompt)),
    answer: agreed(copies.map(copy => copy.answer?.text)) === undefined ? undefined : chosen.answer,
    followup: followup === undefined ? undefined : chosen.followup,
  };
}

export async function loadCohorts(project: string, days: number) {
  if (/(?:^|\/)(?:mind|\.mind)(?:\/|$)/i.test(project)) throw new Error('This workspace is outside Bilan’s session scope.');
  const now = Date.now();
  const since = now - days * 86_400_000;
  const cohorts = new Map<string, Observation[]>();
  const identities = new Map<string, Observation[]>();
  let unreadable = 0;

  for (const { filePath, source } of walkAll()) {
    try {
      const { size, mtimeMs } = await stat(filePath);
      if (!size || mtimeMs < since) continue;
      const scope = sessionScope(filePath, size, source, { skipCodexBootstrap: true });
      if (scope.privateMind || scope.cwd !== project) continue;
      const handle = await open(filePath, 'r');
      const last = Buffer.alloc(1);
      try { await handle.read(last, 0, 1, size - 1); } finally { await handle.close(); }
      const reader = readTurns(source, project);
      const lines = createInterface({ input: createReadStream(filePath, { end: size - 1 }), crlfDelay: Infinity });
      let pending: string | undefined;
      let line = 0;
      const add = (text: string) => {
        line++;
        let entry;
        try { entry = JSON.parse(text); } catch { return; }
        if (entry && typeof entry === 'object') reader.add(entry, line);
      };
      for await (const text of lines) {
        if (pending !== undefined) add(pending);
        pending = text;
      }
      if (pending !== undefined && last[0] === 10) add(pending);
      for (const turn of reader.turns) {
        if (turn.cwd !== project || turn.started < since || turn.started > now) continue;
        const identity = turn.id ? `${source}:${turn.id}` : `${filePath}:${turn.line}`;
        const copies = identities.get(identity) ?? [];
        copies.push({ ...turn, file: filePath, source });
        identities.set(identity, copies);
      }
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error)) throw error;
      unreadable++;
    }
  }

  let unattributed = 0;
  let duplicates = 0;
  let conflictingFollowups = 0;
  for (const copies of identities.values()) {
    duplicates += copies.length - 1;
    const turn = mergeCopies(copies);
    if (!turn.model) { unattributed++; continue; }
    if (!turn.followup && copies.some(copy => copy.followup)) conflictingFollowups++;
    const name = `${turn.source}/${turn.model}`;
    const cohort = cohorts.get(name) ?? [];
    cohort.push(turn);
    cohorts.set(name, cohort);
  }

  const ordered = [...cohorts].sort(([a, left], [b, right]) => right.length - left.length || a.localeCompare(b));
  return { cohorts, ordered, unattributed, duplicates, conflictingFollowups, unreadable };
}
