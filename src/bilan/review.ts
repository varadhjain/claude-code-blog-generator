import { createHash, randomUUID } from 'node:crypto';
import { link, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { loadCohorts, type Observation } from './sessions';
import { reactionPatterns } from './turns';

export const reviewUsage = 'Usage: bilan [review] [--project PATH] [--model SOURCE/MODEL] [--since 30d] [--keep FINDING]';
export const learningsUsage = 'Usage: bilan learnings [QUERY] [--project PATH] [--model SOURCE/MODEL]';

interface Citation {
  file: string;
  turn: number;
  answer?: number;
  followup?: number;
}

interface Finding {
  id: string;
  title: string;
  suggestion: string;
  evidence: Citation[];
  count: number;
}

const verification = /\b(?:(?:actually |live |end.to.end )?(?:test|verify|validate|check) (?:it|that|this|the (?:actual|real|live|installed|deployed)\b)|(?:actual|real|live|end.to.end) (?:test|check|verification))\b/i;
const reportedDone = /\b(?:fixed|implemented|shipped|installed|deployed|tests passed|done|updated|merged)\b/i;
const explicitlyApproved = /^(?:that (?:worked|looks good)|looks good|perfect|exactly what i wanted|yeah[, ]+i like that|good[, ]+ship it|ship it)\b/i;

const rules = [
  {
    id: 'verify',
    title: 'You asked for a check after the agent reported work done',
    suggestion: 'Put the verification step in the initial request and ask for the observable result before the agent calls the work done.',
    match: (turn: Observation) => Boolean(turn.answer && turn.followup &&
      reportedDone.test(turn.answer.text) && verification.test(turn.followup.text) &&
      !verification.test(turn.prompt ?? '')),
  },
  {
    id: 'rework',
    title: 'You explicitly corrected, reopened, or rolled back work',
    suggestion: 'Turn the requirement you had to repeat into an acceptance criterion or a worked example in the first prompt.',
    match: (turn: Observation) => Boolean(turn.followup &&
      Object.values(reactionPatterns).some(pattern => pattern.test(turn.followup!.text))),
  },
  {
    id: 'approval',
    title: 'You explicitly approved the result or asked to ship it',
    suggestion: 'Replay these exchanges to identify a check or example worth repeating on similar work.',
    match: (turn: Observation) => Boolean(turn.answer && turn.followup && explicitlyApproved.test(turn.followup.text)),
  },
  {
    id: 'interruptions',
    title: 'The session logs recorded interrupted turns',
    suggestion: 'Review where you intervened. For similar work, try a smaller first step with a clear checkpoint.',
    match: (turn: Observation) => turn.status === 'cancelled',
  },
];

function parse(args: string[], mode: 'review' | 'learnings') {
  const usage = mode === 'review' ? reviewUsage : learningsUsage;
  let project = process.cwd();
  let days = 30;
  let model: string | undefined;
  let keep: string | undefined;
  const words: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (mode === 'learnings' && !flag.startsWith('-')) { words.push(flag); continue; }
    const value = args[++i];
    if (!value || value.startsWith('--') || seen.has(flag)) throw new Error(usage);
    seen.add(flag);
    if (flag === '--project') project = value;
    else if (flag === '--model') model = value;
    else if (flag === '--since' && mode === 'review' && /^[1-9]\d{0,2}d$/.test(value)) days = Number(value.slice(0, -1));
    else if (flag === '--keep' && mode === 'review') keep = value;
    else throw new Error(usage);
  }
  return { project: resolve(project), days, model, keep, query: words.join(' ').toLowerCase() };
}

function findLearnings(turns: Observation[]): Finding[] {
  return rules.flatMap(({ id, title, suggestion, match }) => {
    const matches = turns.filter(match).sort((a, b) => b.started - a.started);
    if (matches.length < 2) return [];
    const distinct = new Set<string>();
    const samples = matches.filter(turn => {
      if (distinct.has(turn.file)) return false;
      distinct.add(turn.file);
      return true;
    });
    const evidence = [...samples, ...matches.filter(turn => !samples.includes(turn))].slice(0, 3).map(turn => ({
      file: turn.file, turn: turn.line, answer: turn.answer?.line, followup: turn.followup?.line,
    }));
    return [{ id, title, suggestion, evidence, count: matches.length }];
  });
}

function show(finding: Finding) {
  console.log(`\n[${finding.id}] ${finding.title} · ${finding.count} distinct turns`);
  console.log(`  Try: ${finding.suggestion}`);
  for (const entry of finding.evidence) {
    const lines = [`turn line ${entry.turn}`, entry.answer && `answer line ${entry.answer}`, entry.followup && `follow-up line ${entry.followup}`];
    console.log(`  ${JSON.stringify(entry.file)} · ${lines.filter(Boolean).join(', ')}`);
  }
}

const directory = () => join(homedir(), '.bilan', 'learnings');
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === 'ENOENT';

async function keepFinding(project: string, model: string, finding: Finding) {
  const path = directory();
  await mkdir(path, { recursive: true, mode: 0o700 });
  const name = createHash('sha256').update(JSON.stringify([project, model, finding.id])).digest('hex');
  const destination = join(path, `${name}.json`);
  const temporary = join(path, `.${randomUUID()}.tmp`);
  await writeFile(temporary, JSON.stringify({ version: 1, project, model, keptAt: new Date().toISOString(), finding }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  try {
    await link(temporary, destination);
    console.log(`Saved [${finding.id}] to your project learnings.`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
    console.log(`[${finding.id}] is already saved for this project and model.`);
  } finally {
    await unlink(temporary);
  }
}

export async function review(args: string[]) {
  const { project, days, model, keep } = parse(args, 'review');
  const { cohorts, ordered, duplicates, unattributed, conflictingFollowups, unreadable } = await loadCohorts(project, days);
  const selected = model ?? ordered[0]?.[0];
  const turns = selected ? cohorts.get(selected) : undefined;
  if (!selected || !turns?.length) {
    const description = selected ? ` for ${JSON.stringify(selected)}` : '';
    if (keep) throw new Error(`No model-attributed turns found${description}.`);
    console.log(`No model-attributed turns found${description} for this working directory.`);
    return;
  }
  const findings = findLearnings(turns);
  if (keep) {
    const finding = findings.find(candidate => candidate.id === keep);
    if (!finding) throw new Error(`Finding ${JSON.stringify(keep)} is unavailable in this review window.`);
    await keepFinding(project, selected, finding);
    return;
  }
  const covered = turns.filter(turn => turn.followup).length;
  console.log(`Bilan review · ${JSON.stringify(project)} · ${JSON.stringify(selected)} · last ${days}d`);
  console.log(`${turns.length} distinct turns · ${covered} with text follow-ups · ${duplicates} duplicate records collapsed across this project`);
  if (unattributed || conflictingFollowups || unreadable) {
    console.log(`Across the project, excluded ${unattributed} turns without a clear model, ${conflictingFollowups} conflicting follow-ups, and ${unreadable} unreadable files.`);
  }
  for (const finding of findings) show(finding);
  if (!findings.length) console.log('No recurring signals matched the local rules in this window.');
  else console.log('\nKeep a finding with bilan review --keep FINDING using the same project, model, and window.');
  console.log('Findings are based on recorded interruptions and explicit language in the exchange.');
}

export async function learnings(args: string[]) {
  const { project, model, query } = parse(args, 'learnings');
  const files = await readdir(directory()).catch(error => {
    if (missing(error)) return [];
    throw error;
  });
  let found = 0;
  for (const file of files.filter(name => /^[a-f\d]{64}\.json$/.test(name)).sort()) {
    let record;
    try {
      record = JSON.parse(await readFile(join(directory(), file), 'utf8'));
    } catch (error) {
      if (!(error instanceof SyntaxError) && !missing(error)) throw error;
      console.error(`Skipped unreadable learning ${file}.`);
      continue;
    }
    if (record?.version !== 1 || record.project !== project || (model && record.model !== model)) continue;
    const finding: Finding = record.finding;
    if (typeof finding?.id !== 'string' || typeof finding.title !== 'string' ||
        typeof finding.suggestion !== 'string' || !Array.isArray(finding.evidence)) continue;
    if (query && !`${finding.id} ${finding.title} ${finding.suggestion}`.toLowerCase().includes(query)) continue;
    console.log(JSON.stringify(record.model));
    show(finding);
    found++;
  }
  if (!found) console.log('No saved learnings match this project and query.');
}
