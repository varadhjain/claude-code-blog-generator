import { beginAttempt, finishAttempt, type ObsAttempt } from './observability';
/**
 * Multi-provider AI client with token tracking.
 * OpenAI calls require durable explicit caps; unpriced providers are blocked.
 * Priority: OPENAI_API_KEY > ANTHROPIC_API_KEY
 */

import * as dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';

dotenv.config();

export type Provider = 'anthropic' | 'openai';

export interface TokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
}

export class TokenTracker {
  private usage: Map<string, TokenUsage[]> = new Map();

  track(promptType: string, usage: TokenUsage): void {
    if (!this.usage.has(promptType)) {
      this.usage.set(promptType, []);
    }
    this.usage.get(promptType)!.push(usage);
  }

  getStats(promptType?: string): Record<string, any> {
    if (promptType) {
      const usages = this.usage.get(promptType) || [];
      return this.summarizeUsages(promptType, usages);
    }

    const allStats: Record<string, any> = {};
    for (const [type, usages] of this.usage.entries()) {
      allStats[type] = this.summarizeUsages(type, usages);
    }
    return allStats;
  }

  private summarizeUsages(_type: string, usages: TokenUsage[]): Record<string, any> {
    if (usages.length === 0) {
      return { calls: 0, totalTokens: 0, totalCost: 0, unknownCostCalls: 0, unknownUsageCalls: 0 };
    }

    const total = usages.reduce<{ promptTokens: number; completionTokens: number; totalTokens: number; cost: number }>(
      (acc, u) => ({
        promptTokens: acc.promptTokens + (u.promptTokens ?? 0),
        completionTokens: acc.completionTokens + (u.completionTokens ?? 0),
        totalTokens: acc.totalTokens + (u.totalTokens ?? 0),
        cost: acc.cost + (u.cost ?? 0),
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 }
    );

    return {
      calls: usages.length,
      unknownCostCalls: usages.filter(u => u.cost === null).length,
      unknownUsageCalls: usages.filter(u => u.totalTokens === null).length,
      totalTokens: total.totalTokens,
      avgTokensPerCall: Math.round(total.totalTokens / usages.length),
      totalCost: total.cost,
      avgCostPerCall: total.cost / usages.length,
      promptTokens: total.promptTokens,
      completionTokens: total.completionTokens,
    };
  }

  report(): string {
    const stats = this.getStats();
    const lines: string[] = ['\n📊 Token Usage Report', '='.repeat(80)];

    for (const [type, stat] of Object.entries(stats)) {
      lines.push(
        `\n${type}:`,
        `  Calls: ${stat.calls}`,
        `  Known tokens: ${stat.totalTokens.toLocaleString()} (${stat.unknownUsageCalls} calls unknown)`,
        `  Avg tokens/call: ${stat.avgTokensPerCall}`,
        `  Known cost subtotal: $${stat.totalCost.toFixed(6)} (${stat.unknownCostCalls} calls unknown)`,
        `  Avg cost/call: $${stat.avgCostPerCall.toFixed(6)}`
      );
    }

    const grandTotal = Object.values(stats).reduce(
      (acc: any, stat: any) => ({
        calls: acc.calls + stat.calls,
        totalTokens: acc.totalTokens + stat.totalTokens,
        totalCost: acc.totalCost + stat.totalCost,
        unknownCostCalls: acc.unknownCostCalls + stat.unknownCostCalls,
        unknownUsageCalls: acc.unknownUsageCalls + stat.unknownUsageCalls,
      }),
      { calls: 0, totalTokens: 0, totalCost: 0, unknownCostCalls: 0, unknownUsageCalls: 0 }
    );

    lines.push(
      '\n' + '='.repeat(80),
      'TOTAL:',
      `  Calls: ${grandTotal.calls}`,
      `  Known tokens: ${grandTotal.totalTokens.toLocaleString()} (${grandTotal.unknownUsageCalls} calls unknown)`,
      `  Known cost subtotal: $${grandTotal.totalCost.toFixed(6)} (${grandTotal.unknownCostCalls} calls unknown)`,
      '\n'
    );

    return lines.join('\n');
  }
}

// Unpriced providers retain identity, but cannot dispatch.
const PROVIDERS = {
  anthropic: { model: 'claude-haiku-4-5-20251001' },
  openai: { model: 'gpt-6-luna' },
} as const;

function detectProvider(): { provider: Provider; apiKey: string } {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (openaiKey) return { provider: 'openai', apiKey: openaiKey };
  if (anthropicKey) return { provider: 'anthropic', apiKey: anthropicKey };

  throw new Error('model_credential_unavailable');
}

/**
 * Unified AI client. Auto-detects provider from available API keys.
 * Unpriced providers fail before dispatch; provider errors never cause fallback.
 */
export class OpenAIClient {
  private provider: Provider;
  private apiKey: string;
  private tokenTracker: TokenTracker;
  private openaiClient: any;
  private readonly traceId = randomUUID();

  constructor(tokenTracker?: TokenTracker) {
    const detected = detectProvider();
    this.provider = detected.provider;
    this.apiKey = detected.apiKey;
    this.tokenTracker = tokenTracker || new TokenTracker();
  }

  getProvider(): Provider {
    return this.provider;
  }

  getModel(): string {
    return PROVIDERS[this.provider].model;
  }

  getTokenTracker(): TokenTracker {
    return this.tokenTracker;
  }

  private async getOpenAIClient() {
    if (!this.openaiClient) {
      const { default: OpenAI } = await import('openai');
      this.openaiClient = new OpenAI({ apiKey: this.apiKey, maxRetries: 0, timeout: 120_000 });
    }
    return this.openaiClient;
  }

  async callStructured<T = any>(
    promptType: string,
    systemPrompt: string,
    userPrompt: string,
    options: { temperature?: number; maxTokens?: number; responseFormat?: 'json_object' | 'text' } = {}
  ): Promise<T> {
    // Anthropic pricing/cache/tier bounds have not been established for this
    // workload. Key presence never grants an unpriced provider fallback.
    if (this.provider !== 'openai') throw new Error('model_provider_accounting_unavailable');
    const { maxTokens = 2500, responseFormat = 'json_object' } = options;
    if (typeof systemPrompt !== 'string' || typeof userPrompt !== 'string' || !userPrompt.trim() || !['json_object', 'text'].includes(responseFormat)) throw new Error('model_request_invalid');
    const params = {
      model: PROVIDERS.openai.model,
      messages: [{ role: 'system' as const, content: systemPrompt }, { role: 'user' as const, content: userPrompt }],
      max_completion_tokens: maxTokens, reasoning_effort: 'high' as const,
      service_tier: 'default' as const,
      ...(responseFormat === 'json_object' ? { response_format: { type: 'json_object' as const } } : {}),
    };
    let attempt: ObsAttempt;
    try { attempt = await beginAttempt(params, this.traceId); }
    catch { throw new Error('model_preflight_unavailable'); }
    let response: any;
    try {
      const client = await this.getOpenAIClient();
      response = await client.chat.completions.create(params);
    } catch (error: unknown) {
      const detail = error as { status?: number; name?: string };
      const category = detail?.status === 401 || detail?.status === 403 ? 'auth' : detail?.status === 429 ? 'quota' : detail?.name === 'AbortError' || detail?.name === 'APIConnectionTimeoutError' ? 'timeout' : 'provider_error';
      await finishAttempt(attempt, { outcome: 'error', error_category: category, http_status: detail?.status });
      throw new Error('model_call_' + category);
    }
    const raw = response?.usage;
    const value = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 10_000_000 ? v : null;
    const usage = {
      input_tokens: value(raw?.prompt_tokens), output_tokens: value(raw?.completion_tokens),
      cached_input_tokens: value(raw?.prompt_tokens_details?.cached_tokens),
      cache_write_tokens: value(raw?.prompt_tokens_details?.cache_write_tokens),
      reasoning_tokens: value(raw?.completion_tokens_details?.reasoning_tokens),
    };
    const choice = response?.choices?.[0];
    const content = typeof choice?.message?.content === 'string' ? choice.message.content : '';
    const completed = choice?.finish_reason === 'stop' && Boolean(content);
    const cost = await finishAttempt(attempt, {
      outcome: completed ? 'success' : 'incomplete', returned_model: response?.model,
      returned_tier: response?.service_tier, request_id: response?._request_id,
      response_id: response?.id, usage,
    });
    this.tokenTracker.track(promptType, {
      promptTokens: usage.input_tokens, completionTokens: usage.output_tokens,
      totalTokens: usage.input_tokens === null || usage.output_tokens === null ? null : usage.input_tokens + usage.output_tokens,
      cost,
    });
    if (!completed) throw new Error('model_response_incomplete');
    if (responseFormat === 'json_object') {
      let json = content.trim();
      const code = json.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (code) json = code[1].trim();
      try { return JSON.parse(json) as T; }
      catch { throw new Error('model_response_invalid_json'); }
    }
    return content as T;
  }

  async callText(
    promptType: string,
    systemPrompt: string,
    userPrompt: string,
    options: {
      temperature?: number;
      maxTokens?: number;
    } = {}
  ): Promise<string> {
    return this.callStructured<string>(promptType, systemPrompt, userPrompt, {
      ...options,
      responseFormat: 'text',
    });
  }
}
