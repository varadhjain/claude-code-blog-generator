import { resolve } from 'node:path';
import { reactionPatterns } from './turns';
import { loadCohorts, type Observation } from './sessions';

export const usage = 'Usage: bilan compare [--project PATH] [--since 30d] [--model SOURCE/MODEL --model SOURCE/MODEL] [--evidence]';
const rows = [
  ['Intent correction', reactionPatterns.correction],
  ['Still broken', reactionPatterns.broken],
  ['Undo request', reactionPatterns.undo],
] as const;

function options(args: string[]) {
  let project = process.cwd();
  let days = 30;
  let evidence = false;
  const models: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--evidence') { evidence = true; continue; }
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(usage);
    if (flag === '--project') project = value;
    else if (flag === '--model') models.push(value);
    else if (flag === '--since' && /^[1-9]\d{0,2}d$/.test(value)) days = Number(value.slice(0, -1));
    else throw new Error(usage);
  }
  if (models.length !== 0 && (models.length !== 2 || models[0] === models[1])) throw new Error(usage);
  return { project: resolve(project), days, models, evidence };
}

function rate(count: number, total: number) {
  return total ? `${count}/${total} (${(count * 100 / total).toFixed(1)}%)` : '—';
}

function median(turns: Observation[]) {
  const times = turns.flatMap(turn => turn.status === 'completed' && turn.duration !== undefined ? [turn.duration] : [])
    .sort((a, b) => a - b);
  const middle = Math.floor(times.length / 2);
  if (!times.length) return { value: undefined, label: '—' };
  const value = times.length % 2 ? times[middle] : (times[middle - 1] + times[middle]) / 2;
  return { value, label: `${(value / 1000).toFixed(1)} s (n=${times.length})` };
}

function edge(left: number | undefined, right: number | undefined, names: string[]) {
  if (left === undefined || right === undefined || names.length !== 2) return '—';
  if (left === right) return 'Tie';
  return left < right ? 'A' : 'B';
}

function render(cohorts: Map<string, Observation[]>, names: string[], evidence: boolean) {
  const groups = names.map(name => cohorts.get(name) ?? []);
  const followups = groups.map(group => group.filter(turn => turn.followup));
  const label = (name: string) => name.replace(/[\x00-\x1f\x7f|]/g, '?').slice(0, 76);
  const table = [
    ['Metric', ...names.map((name, i) => `${i === 0 ? 'A' : 'B'} · ${label(name)}`), 'Edge'],
    ['Started turns', ...groups.map(group => String(group.length)), '—'],
    ['Text follow-up coverage', ...groups.map((group, i) => rate(followups[i].length, group.length)), '—'],
  ];
  for (const [row, pattern] of rows) {
    const counts = followups.map(group => group.filter(turn => pattern.test(turn.followup!.text)).length);
    const values = counts.map((count, i) => followups[i].length ? count / followups[i].length : undefined);
    table.push([row, ...counts.map((count, i) => rate(count, followups[i].length)), edge(values[0], values[1], names)]);
  }
  const cancelled = groups.map(group => group.filter(turn => turn.status === 'cancelled').length);
  const known = groups.map(group => group.filter(turn => turn.status).length);
  const cancellations = cancelled.map((count, i) => known[i] && known[i] === groups[i].length ? count / known[i] : undefined);
  table.push(['Recorded cancelled', ...cancelled.map((count, i) => known[i] ? rate(count, groups[i].length) : '—'),
    edge(cancellations[0], cancellations[1], names)]);
  table.push(['Recorded terminal status', ...known.map((count, i) => rate(count, groups[i].length)), '—']);
  const durations = groups.map(median);
  table.push(['Median completed turn', ...durations.map(duration => duration.label), edge(durations[0]?.value, durations[1]?.value, names)]);
  const widths = table[0].map((_, i) => Math.max(...table.map(row => row[i].length)));
  const line = (row: string[]) => row.map((cell, i) => cell.padEnd(widths[i])).join(' | ').trimEnd();
  console.log([line(table[0]), widths.map(width => '─'.repeat(width)).join('─┼─'), ...table.slice(1).map(line)].join('\n'));
  console.log('\nReaction rows count explicit phrases in text follow-ups. A turn may match multiple rows.');
  if (known.some((count, i) => count < groups[i].length)) console.log('Incomplete terminal records can undercount cancellations.');
  if (evidence) {
    for (const [row, pattern] of rows) {
      for (const [i, group] of followups.entries()) {
        for (const turn of group.filter(turn => pattern.test(turn.followup!.text)).slice(0, 3)) {
          console.log(`${i === 0 ? 'A' : 'B'} · ${row} · ${JSON.stringify(turn.file)} · turn line ${turn.line}, follow-up line ${turn.followup!.line}`);
        }
      }
    }
  }
}

export async function compare(args: string[]) {
  const { project, days, models, evidence } = options(args);
  const { cohorts, ordered, unattributed, duplicates, conflictingFollowups, unreadable } = await loadCohorts(project, days);
  const names = models.length ? models : ordered.slice(0, 2).map(([name]) => name);
  console.log(`Bilan · ${JSON.stringify(project)} · last ${days}d`);
  if (names.length) render(cohorts, names, evidence);
  else console.log('No model-attributed turns found for this exact session working directory.');
  if (names.length === 1) console.log('One model cohort found. Try a wider date window or another project for a side-by-side comparison.');
  if (unattributed) console.log(`Turns with unknown or mixed model: ${unattributed}`);
  if (duplicates) console.log(`Duplicate turn records collapsed: ${duplicates}`);
  if (conflictingFollowups) console.log(`Turns with conflicting follow-ups across copies: ${conflictingFollowups}`);
  if (unreadable) console.log(`Unreadable session files: ${unreadable}`);
  const others = ordered.filter(([name]) => !names.includes(name));
  if (others.length) console.log('Other cohorts: ' + others.map(([name, turns]) => `${JSON.stringify(name)} (${turns.length})`).join(', '));
}
