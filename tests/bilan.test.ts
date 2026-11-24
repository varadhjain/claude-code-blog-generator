import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { readTurns } from '../src/bilan/turns';

const cwd = '/example/project';
const timestamp = (seconds: number) => new Date(1_720_000_000_000 + seconds * 1000).toISOString();

function codexEvent(type: string, turn_id: string, seconds: number, fields = {}) {
  return { type: 'event_msg', timestamp: timestamp(seconds), payload: { type, turn_id, ...fields } };
}

test('Codex pairs a follow-up to the preceding completed root turn', () => {
  const reader = readTurns('codex', cwd);
  const prompt = (text: string) => ({
    type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
  });
  [
    codexEvent('task_started', 'one', 1),
    prompt('# AGENTS.md instructions for project'),
    { type: 'turn_context', payload: { turn_id: 'one', cwd, model: 'model-a' } },
    prompt('Fix the save button'),
    codexEvent('task_started', 'child', 3, { root_turn_id: 'one' }),
    codexEvent('task_complete', 'one', 5, { duration_ms: 3900 }),
    codexEvent('task_started', 'two', 6),
    { type: 'turn_context', payload: { turn_id: 'two', cwd, model: 'model-b' } },
    prompt('It is still broken. Undo that.'),
    codexEvent('turn_aborted', 'two', 7, { reason: 'interrupted' }),
  ].forEach((row, i) => reader.add(row, i + 1));
  expect(reader.turns).toMatchObject([
    { line: 1, model: 'model-a', status: 'completed', duration: 3900, followup: { line: 9, text: 'It is still broken. Undo that.' } },
    { line: 7, model: 'model-b', status: 'cancelled' },
  ]);
  expect(reader.turns).toHaveLength(2);
});

test('Claude Code ignores tool responses and sidechains and follows explicit lineage', () => {
  const reader = readTurns('claude-code', cwd);
  const row = (type: string, uuid: string, parentUuid: string | null, seconds: number, message: object, fields = {}) =>
    ({ type, uuid, parentUuid, cwd, timestamp: timestamp(seconds), message, ...fields });
  [
    row('user', 'prompt', null, 1, { content: 'Fix the toolbar' }),
    row('assistant', 'tool', 'prompt', 2, { model: 'model-a', stop_reason: 'tool_use' }),
    row('user', 'result', 'tool', 3, { content: [{ type: 'tool_result' }] }),
    row('assistant', 'side', 'tool', 4, { model: 'other-model', stop_reason: 'end_turn' }, { isSidechain: true }),
    row('assistant', 'final', 'result', 5, { model: 'model-a', stop_reason: 'end_turn' }),
    row('user', 'separate', null, 6, { content: 'Undo that.' }),
    row('user', 'reaction', 'final', 7, { content: 'This is not what I meant.' }),
    row('assistant', 'work', 'reaction', 8, { model: 'model-b', stop_reason: 'tool_use' }),
    row('user', 'interruption', 'work', 9, { content: '[Request interrupted by user]' }),
  ].forEach((entry, i) => reader.add(entry, i + 1));
  expect(reader.turns).toMatchObject([
    { line: 1, model: 'model-a', status: 'completed', duration: 4000, followup: { line: 7, text: 'This is not what I meant.' } },
    { line: 6 },
    { line: 7, model: 'model-b', status: 'cancelled' },
  ]);
  expect(reader.turns).toHaveLength(3);
});

test('installed CLI reports two cohorts, source lines, and excludes private conversations', () => {
  const home = mkdtempSync(join(tmpdir(), 'bilan-test-'));
  try {
    const dir = join(home, '.codex', 'sessions');
    mkdirSync(dir, { recursive: true });
    const now = new Date(Date.now() - 10_000).toISOString();
    const task = (id: string, model: string, text: string) => [
      { type: 'event_msg', timestamp: now, payload: { type: 'task_started', turn_id: id } },
      { type: 'turn_context', payload: { turn_id: id, cwd, model } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } },
      { type: 'event_msg', timestamp: now, payload: { type: 'task_complete', turn_id: id, duration_ms: 2000 } },
    ];
    const write = (name: string, entries: object[]) =>
      writeFileSync(join(dir, name), entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
    const bootstrap = {
      type: 'response_item',
      payload: {
        type: 'message', role: 'user', content: [
          { type: 'input_text', text: '# AGENTS.md instructions for /example/project\n<INSTRUCTIONS>Keep Mind separate.</INSTRUCTIONS>' },
          { type: 'input_text', text: '<environment_context>example</environment_context>' },
        ],
      },
    };
    const first = task('one', 'model-a', 'Fix the toolbar.');
    write('safe.jsonl', [first[0], bootstrap, ...first.slice(1), ...task('two', 'model-b', 'Undo that.')]);
    write('fork.jsonl', first);
    write('excluded.jsonl', task('three', 'private-model', 'Open my private journal.'));
    const run = spawnSync(process.execPath, [
      '-r', 'ts-node/register/transpile-only', 'src/bilan/cli.ts', 'compare', '--project', cwd, '--evidence',
    ], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/A · codex\/model-a.*B · codex\/model-b/);
    expect(run.stdout).toMatch(/Undo request\s+\| 1\/1 \(100\.0%\)\s+\| —/);
    expect(run.stdout).toContain('turn line 1, follow-up line 8');
    expect(run.stdout).toContain('Duplicate turn records collapsed: 1');
    expect(run.stdout).not.toMatch(/private-model|private journal|Undo that/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('single-model review connects the exchange and keeps evidence only on explicit request', () => {
  const home = mkdtempSync(join(tmpdir(), 'bilan-review-test-'));
  try {
    const source = join(home, '.codex', 'sessions');
    const saved = join(home, '.bilan', 'learnings');
    mkdirSync(source, { recursive: true });
    const now = new Date(Date.now() - 10_000).toISOString();
    const task = (id: string, text: string, reply: string) => [
      { type: 'event_msg', timestamp: now, payload: { type: 'task_started', turn_id: id } },
      { type: 'turn_context', payload: { turn_id: id, cwd, model: 'model-a' } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } },
      { type: 'event_msg', timestamp: now, payload: { type: 'task_complete', turn_id: id, last_agent_message: reply } },
    ];
    const write = (name: string, entries: object[]) => writeFileSync(join(source, name),
      entries.map(entry => JSON.stringify(entry)).join('\n') + '\n');
    const first: object[] = task('one', 'Fix the toolbar.', '');
    first.splice(3, 0, {
      type: 'response_item', timestamp: now, payload: {
        type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text: 'Fixed the toolbar.' }],
      },
    });
    write('one.jsonl', [...first, ...task('two', 'Verify the actual workflow.', 'Checked.')]);
    write('two.jsonl', [...task('three', 'Fix the dialog.', 'Fixed the dialog.'), ...task('four', 'Run a live check.', 'Checked.')]);
    write('three.jsonl', [...task('five', 'Verify the real workflow after you fix it.', 'Fixed it.'), ...task('six', 'Verify the real workflow.', 'Checked.')]);
    const run = (...args: string[]) => {
      const result = spawnSync(process.execPath, [
        '-r', 'ts-node/register/transpile-only', 'src/bilan/cli.ts', ...args,
      ], { env: { ...process.env, HOME: home }, encoding: 'utf8' });
      expect(result.status).toBe(0);
      return result.stdout;
    };
    const output = run('--project', cwd);
    expect(output).toMatch(/\[verify\].*2 distinct turns/);
    expect(output).toContain('turn line 1, answer line 4, follow-up line 8');
    expect(existsSync(saved)).toBe(false);
    expect(run('review', '--project', cwd, '--model', 'codex/model-a', '--keep', 'verify')).toContain('Saved [verify]');
    expect(run('review', '--project', cwd, '--keep', 'verify')).toContain('already saved');
    const [file] = readdirSync(saved);
    expect(readdirSync(saved)).toHaveLength(1);
    expect(statSync(join(saved, file)).mode & 0o777).toBe(0o600);
    expect(readFileSync(join(saved, file), 'utf8')).not.toContain('Fix the toolbar');
    expect(run('learnings', 'verification', '--project', cwd)).toContain('[verify]');
    expect(run('learnings', '--project', '/example/other')).toContain('No saved learnings');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
