/* Offline bounded fixtures. Run: node -r ts-node/register scripts/test-ai-observability.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const home = process.argv.includes('--child') ? process.env.HOME : fs.mkdtempSync(path.join(os.tmpdir(), 'blog-observability-'));
fs.chmodSync(home, 0o700); process.chdir(home); process.env.HOME = home;
process.env.OPENAI_API_KEY = 'fixture-key'; process.env.ANTHROPIC_API_KEY = 'fixture-anthropic';
require('node:http').request = require('node:https').request = () => { throw new Error('network forbidden'); };
global.fetch = () => { throw new Error('network forbidden'); };
const { OpenAIClient } = require('../src/ai/client');
const { beginAttempt, finishAttempt, reservationFor } = require('../src/ai/observability');
const params = { model: 'gpt-6-luna', service_tier: 'default', messages: [{ role: 'user', content: 'PRIVATE_PROMPT' }], max_completion_tokens: 100 };
const readEvents = dir => fs.existsSync(path.join(dir, 'events.jsonl')) ? fs.readFileSync(path.join(dir, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
function config(name, cap = 1) {
  const dir = path.join(home, name); process.env.OBSERVABILITY_DIR = dir;
  process.env.OBSERVABILITY_BUDGETS_JSON = JSON.stringify({ 'blog-post-generator.generate': cap });
  delete process.env.OBSERVABILITY_TRACE_ID; delete process.env.OBSERVABILITY_PARENT_ID;
  return dir;
}
const response = (extra = {}) => ({ model: 'gpt-6-luna', service_tier: 'default', id: 'chatcmpl-fixture', _request_id: 'req_fixture', choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 100, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 60, cache_write_tokens: 20 }, completion_tokens_details: { reasoning_tokens: 15 } }, ...extra });
function fake(fn) { const client = new OpenAIClient(); client.openaiClient = { chat: { completions: { create: fn } } }; return client; }
async function main() {
  if (process.argv.includes('--child')) {
    try { await beginAttempt(params); console.log('admitted'); } catch { console.log('blocked'); }
    return;
  }
  let dir = config('success'); let calls = 0;
  const client = fake(async () => { calls++; return response(); });
  assert.deepEqual(await client.callStructured('PRIVATE_LABEL', 'PRIVATE_SYSTEM', 'PRIVATE_PROMPT', { maxTokens: 100 }), { ok: true });
  assert.equal(calls, 1); let rows = readEvents(dir); assert.deepEqual(rows.map(r => r.phase), ['intent', 'attempt', 'outcome']);
  assert.deepEqual(rows[2].usage, { input_tokens: 100, output_tokens: 40, cached_input_tokens: 60, cache_write_tokens: 20, reasoning_tokens: 15 });
  assert.equal(rows[2].cost_usd, 0.0000251); assert.equal(fs.statSync(dir).mode & 0o777, 0o700); assert.equal(fs.statSync(path.join(dir, 'events.jsonl')).mode & 0o777, 0o600);
  assert(!JSON.stringify(rows).includes('PRIVATE')); assert(!JSON.stringify(rows).includes('fixture-key'));
  console.log('success_usage_privacy_modes PASS');
  dir = config('inconsistent-usage');
  await fake(async () => response({ usage: { prompt_tokens: 100, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 90, cache_write_tokens: 30 }, completion_tokens_details: { reasoning_tokens: 99 } } })).callText('x', 's', 'p');
  rows = readEvents(dir); assert.equal(rows[2].usage.cached_input_tokens, null); assert.equal(rows[2].usage.cache_write_tokens, null); assert.equal(rows[2].usage.reasoning_tokens, null); assert.equal(rows[2].cost_usd, null);
  console.log('inconsistent_optional_usage_unknown PASS');
  dir = config('missing-cap'); process.env.OBSERVABILITY_BUDGETS_JSON = '{}'; calls = 0;
  await assert.rejects(fake(async () => { calls++; return response(); }).callText('x', 's', 'p'), /model_preflight_unavailable/); assert.equal(calls, 0);
  console.log('missing_cap_no_dispatch PASS');
  for (const status of [401, 429]) {
    dir = config('failure-' + status); calls = 0;
    await assert.rejects(fake(async () => { calls++; throw Object.assign(new Error('PRIVATE_PROVIDER_BODY'), { status }); }).callText('x', 's', 'p'), /model_call_(auth|quota)/);
    assert.equal(calls, 1); rows = readEvents(dir); assert(!JSON.stringify(rows).includes('PRIVATE')); assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'budget.json'))).reservations[0].state, 'held');
  }
  console.log('auth_quota_no_retry_unknown_hold PASS');
  dir = config('unknown'); const unknown = fake(async () => response({ usage: undefined, model: undefined, service_tier: undefined })); await unknown.callText('x', 's', 'p');
  rows = readEvents(dir); assert.equal(rows[2].cost_usd, null); assert.equal(rows[2].usage.input_tokens, null); assert.equal(unknown.getTokenTracker().getStats('x').unknownCostCalls, 1);
  console.log('unknown_usage_model_tier PASS');
  dir = config('invalid-json');
  await assert.rejects(fake(async () => response({ choices: [{ finish_reason: 'stop', message: { content: 'PRIVATE_RESPONSE' } }] })).callStructured('x', 's', 'p'), error => error.message === 'model_response_invalid_json');
  assert.equal(readEvents(dir).filter(r => r.phase === 'outcome').length, 1);
  console.log('parse_error_no_content_no_duplicate_outcome PASS');
  dir = config('postaccepted');
  await fake(async () => { fs.renameSync(path.join(dir, 'events.jsonl'), path.join(dir, 'preserved-events.jsonl')); fs.symlinkSync(path.join(dir, 'preserved-events.jsonl'), path.join(dir, 'events.jsonl')); return response(); }).callText('x', 's', 'p');
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'budget.json'))).reservations[0].state, 'held');
  console.log('postaccepted_logging_failure_preserves_response_and_hold PASS');
  delete process.env.OPENAI_API_KEY; const anthropic = new OpenAIClient(); await assert.rejects(anthropic.callText('x', 's', 'p'), /model_provider_accounting_unavailable/); process.env.OPENAI_API_KEY = 'fixture-key';
  console.log('unpriced_anthropic_blocked PASS');
  dir = config('parallel', reservationFor(params) * 2.05); process.env.OBSERVABILITY_TRACE_ID = randomUUID(); process.env.OBSERVABILITY_MAX_ATTEMPTS_PER_TRACE = '2';
  const env = { PATH: process.env.PATH, HOME: home, OBSERVABILITY_DIR: dir, OBSERVABILITY_BUDGETS_JSON: process.env.OBSERVABILITY_BUDGETS_JSON, OBSERVABILITY_TRACE_ID: process.env.OBSERVABILITY_TRACE_ID, OBSERVABILITY_MAX_ATTEMPTS_PER_TRACE: '2', TS_NODE_PROJECT: path.resolve(__dirname, '..', 'tsconfig.json') };
  const children = Array.from({ length: 6 }, () => new Promise((resolve, reject) => { const child = spawn(process.execPath, ['-r', require.resolve('ts-node/register'), __filename, '--child'], { env, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = ''; child.stdout.on('data', x => stdout += x); child.stderr.on('data', x => stderr += x); child.on('error', reject); child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr))); }));
  const outcomes = await Promise.all(children); assert.equal(outcomes.filter(x => x.includes('admitted')).length, 2); assert.equal(JSON.parse(fs.readFileSync(path.join(dir, 'budget.json'))).reservations.length, 2);
  process.env.OBSERVABILITY_BUDGETS_JSON = JSON.stringify({ 'blog-post-generator.generate': reservationFor(params) }); await assert.rejects(beginAttempt(params));
  console.log('crossprocess_cap_trace_limit_and_lowered_cap PASS');
  // Known zero is valid; missing usage above stayed unknown and held.
  config('known-zero'); const ticket = await beginAttempt(params); await finishAttempt(ticket, { outcome: 'success', returned_model: 'gpt-6-luna', returned_tier: 'default', usage: { input_tokens: 0, output_tokens: 0, cached_input_tokens: 0, cache_write_tokens: 0 } });
  assert.equal(readEvents(process.env.OBSERVABILITY_DIR)[2].cost_usd, 0);
  console.log('known_zero_distinct_from_unknown PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
