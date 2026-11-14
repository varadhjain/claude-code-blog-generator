/** App-local metadata and lifetime budget owner. Unknown outcomes retain holds. */
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, readFile, rename, rmdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export type ObsUsage = { input_tokens: number | null; output_tokens: number | null; cached_input_tokens: number | null; cache_write_tokens: number | null; reasoning_tokens: number | null };
export type ObsAttempt = { trace_id: string; attempt_id: string; parent_id: string | null; reservation_usd: number };
export type ObsResult = { outcome: 'success' | 'incomplete' | 'error'; error_category?: 'auth' | 'quota' | 'timeout' | 'provider_error'; http_status?: number | null; returned_model?: unknown; returned_tier?: unknown; request_id?: unknown; response_id?: unknown; usage?: Partial<ObsUsage> };
type Reservation = { attempt_id: string; trace_id: string; amount_usd: number; actual_usd: number | null; state: 'held' | 'settled' };
type Budget = { schema_version: 1; reservations: Reservation[] };
const MODEL = 'gpt-6-luna';
const WORKLOAD = 'generate';
const BOUNDARY = 'blog.ai.client';
const APP = 'blog-post-generator';
const PRICE_VERSION = 'openai-standard-2026-10-06';
const ids = /^[0-9a-f]{32}$|^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const opaque = (v: unknown): string | null => typeof v === 'string' && ids.test(v) ? v.replace(/-/g, '').toLowerCase() : null;
const count = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 10_000_000 ? v : null;
const money = (v: unknown): number | null => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
function directory(): string {
  if (process.env.NODE_ENV === 'production' && !process.env.OBSERVABILITY_DIR) throw new Error('model_persistent_storage_required');
  return process.env.OBSERVABILITY_DIR || join(homedir(), '.firm-stack', 'observability', APP);
}
async function prepare(): Promise<string> {
  const dir = directory();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const stat = await lstat(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('model_storage_unsafe');
  await chmod(dir, 0o700);
  return dir;
}
async function syncDirectory(dir: string): Promise<void> {
  const h = await open(dir, 'r'); try { await h.sync(); } finally { await h.close(); }
}
async function append(record: object): Promise<void> {
  const dir = await prepare();
  const h = await open(join(dir, 'events.jsonl'), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  try {
    if (!(await h.stat()).isFile()) throw new Error('model_storage_unsafe');
    await h.chmod(0o600); await h.writeFile(JSON.stringify(record) + '\n'); await h.sync();
  } finally { await h.close(); }
  await syncDirectory(dir);
}
async function withLock<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await prepare(); const lock = join(dir, '.budget-lock');
  let locked = false;
  for (let i = 0; i < 200; i++) {
    try { await mkdir(lock, { mode: 0o700 }); locked = true; break; }
    catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }
  if (!locked) throw new Error('model_budget_busy');
  // A crash leaves the lock closed for owner reconciliation; never guess expiry.
  try { return await fn(dir); } finally { await rmdir(lock); }
}
async function loadBudget(dir: string): Promise<Budget> {
  let state: Budget;
  try {
    const stat = await lstat(join(dir, 'budget.json'));
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 20_000_000) throw new Error('model_budget_invalid');
    state = JSON.parse(await readFile(join(dir, 'budget.json'), 'utf8'));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { schema_version: 1, reservations: [] };
    throw new Error('model_budget_invalid');
  }
  if (state.schema_version !== 1 || !Array.isArray(state.reservations) || state.reservations.some(r => !opaque(r.attempt_id) || !opaque(r.trace_id) || money(r.amount_usd) === null || r.amount_usd <= 0 || !['held', 'settled'].includes(r.state) || (r.state === 'settled' && (money(r.actual_usd) === null || r.actual_usd! > r.amount_usd)))) throw new Error('model_budget_invalid');
  if (new Set(state.reservations.map(r => r.attempt_id)).size !== state.reservations.length) throw new Error('model_budget_invalid');
  return state;
}
async function saveBudget(dir: string, state: Budget): Promise<void> {
  const path = join(dir, 'budget.json'); const tmp = path + '.tmp-' + randomUUID();
  const h = await open(tmp, 'wx', 0o600);
  try { await h.writeFile(JSON.stringify(state)); await h.sync(); } finally { await h.close(); }
  await rename(tmp, path); await chmod(path, 0o600); await syncDirectory(dir);
}
function record(attempt: ObsAttempt, phase: 'intent' | 'attempt' | 'outcome', result?: ObsResult, cost: number | null = null, basis = 'unavailable'): object {
  const usage = result?.usage || {};
  const status = result?.http_status;
  const requestId = typeof result?.request_id === 'string' && /^req_[A-Za-z0-9_-]{1,120}$/.test(result.request_id) ? result.request_id : null;
  const responseId = typeof result?.response_id === 'string' && /^chatcmpl-[A-Za-z0-9_-]{1,120}$/.test(result.response_id) ? result.response_id : null;
  if (!opaque(attempt.trace_id) || !opaque(attempt.attempt_id) || money(attempt.reservation_usd) === null) throw new Error('model_attempt_invalid');
  return { schema_version: 1, event_id: randomUUID(), trace_id: opaque(attempt.trace_id), attempt_id: opaque(attempt.attempt_id), parent_id: opaque(attempt.parent_id), reservation_usd: attempt.reservation_usd, occurred_at: new Date().toISOString(), app: APP, workload: WORKLOAD, boundary_id: BOUNDARY, phase, direction: 'outbound', provider: 'openai', endpoint: 'chat-completions', credential_alias: 'blog-openai', requested_model: MODEL, returned_model: result?.returned_model === MODEL ? MODEL : null, requested_tier: 'default', returned_tier: result?.returned_tier === 'default' ? 'default' : null, outcome: result && ['success', 'incomplete', 'error'].includes(result.outcome) ? result.outcome : null, error_category: result?.error_category && ['auth', 'quota', 'timeout', 'provider_error'].includes(result.error_category) ? result.error_category : null, http_status: typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599 ? status : null, usage: { input_tokens: count(usage.input_tokens), output_tokens: count(usage.output_tokens), cached_input_tokens: count(usage.cached_input_tokens), cache_write_tokens: count(usage.cache_write_tokens), reasoning_tokens: count(usage.reasoning_tokens) }, request_id: requestId, response_id: responseId, cost_usd: cost, cost_basis: basis, rate_version: PRICE_VERSION };
}
export function reservationFor(request: Record<string, unknown>): number {
  const maximum = request.max_completion_tokens;
  if (request.model !== MODEL || request.service_tier !== 'default' || !Number.isSafeInteger(maximum) || (maximum as number) < 1 || (maximum as number) > 8192 || request.tools || request.stream || request.modalities) throw new Error('model_request_unsupported');
  const bytes = Buffer.byteLength(JSON.stringify(request), 'utf8');
  if (bytes > 256_000) throw new Error('model_input_bound_exceeded');
  // Byte-based token upper bound plus framing margin; worst cache-write and
  // long-context multipliers. No token/cache discount is assumed at admission.
  return (2 * bytes * 0.125 * 2 + (maximum as number) * 0.50 * 1.5) / 1_000_000;
}
export async function beginAttempt(request: Record<string, unknown>, traceId?: string): Promise<ObsAttempt> {
  const reserve = reservationFor(request);
  let cap: number | null = null;
  try { cap = money(JSON.parse(process.env.OBSERVABILITY_BUDGETS_JSON || '{}')[APP + '.' + WORKLOAD]); } catch { /* fail closed below */ }
  const limit = Number(process.env.OBSERVABILITY_MAX_ATTEMPTS_PER_TRACE || '32');
  if (cap === null || cap <= 0 || !Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('model_explicit_budget_required');
  const attempt: ObsAttempt = { trace_id: opaque(process.env.OBSERVABILITY_TRACE_ID) || opaque(traceId) || randomUUID().replace(/-/g, ''), attempt_id: randomUUID(), parent_id: opaque(process.env.OBSERVABILITY_PARENT_ID), reservation_usd: reserve };
  await withLock(async dir => {
    const state = await loadBudget(dir);
    const spent = state.reservations.reduce((sum, r) => sum + (r.state === 'settled' ? r.actual_usd! : r.amount_usd), 0);
    if (spent + reserve > cap || state.reservations.filter(r => r.trace_id === attempt.trace_id).length >= limit) throw new Error('model_budget_exhausted');
    state.reservations.push({ attempt_id: attempt.attempt_id, trace_id: attempt.trace_id, amount_usd: reserve, actual_usd: null, state: 'held' });
    await saveBudget(dir, state);
  });
  await append(record(attempt, 'intent'));
  await append(record(attempt, 'attempt'));
  return attempt;
}
export function pricedCost(result: ObsResult): { cost: number | null; basis: string } {
  const u = result.usage || {}; const input = count(u.input_tokens); const output = count(u.output_tokens);
  if (result.returned_model !== MODEL || result.returned_tier !== 'default' || input === null || output === null) return { cost: null, basis: 'unavailable' };
  const cached = count(u.cached_input_tokens); const written = count(u.cache_write_tokens);
  const multiplier = input > 272_000 ? 2 : 1; const outputRate = input > 272_000 ? 0.75 : 0.50;
  if (cached !== null && written !== null) {
    if (cached + written > input) return { cost: null, basis: 'unavailable' };
    return { cost: ((input - cached - written) * 0.10 * multiplier + cached * 0.01 * multiplier + written * 0.125 * multiplier + output * outputRate) / 1_000_000, basis: 'provider_tokens_rate_estimate' };
  }
  return { cost: (input * 0.125 * multiplier + output * outputRate) / 1_000_000, basis: 'conservative_cache_upper_estimate' };
}
export async function finishAttempt(attempt: ObsAttempt, result: ObsResult): Promise<number | null> {
  let { cost, basis } = pricedCost(result);
  if (cost !== null && cost > attempt.reservation_usd) { cost = null; basis = 'unavailable'; }
  try {
    // Receipt before release. Failure retains the durable original hold.
    await append(record(attempt, 'outcome', result, cost, basis));
    if (cost !== null) await withLock(async dir => {
      const state = await loadBudget(dir); const row = state.reservations.find(r => r.attempt_id === attempt.attempt_id);
      if (!row || row.state !== 'held' || row.amount_usd !== attempt.reservation_usd) return;
      row.actual_usd = cost; row.state = 'settled'; await saveBudget(dir, state);
    });
  } catch { console.error('Model outcome observation unavailable; reservation retained.'); }
  return cost;
}
