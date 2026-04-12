/**
 * Multi-provider AI client with token tracking.
 * Supports Anthropic (Claude) and OpenAI. Auto-detects available API key.
 * Priority: ANTHROPIC_API_KEY > OPENAI_API_KEY
 */

import * as dotenv from 'dotenv';

dotenv.config();

export type Provider = 'anthropic' | 'openai';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
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
      return { calls: 0, totalTokens: 0, totalCost: 0 };
    }

    const total = usages.reduce(
      (acc, u) => ({
        promptTokens: acc.promptTokens + u.promptTokens,
        completionTokens: acc.completionTokens + u.completionTokens,
        totalTokens: acc.totalTokens + u.totalTokens,
        cost: acc.cost + u.cost,
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0, cost: 0 }
    );

    return {
      calls: usages.length,
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
        `  Total tokens: ${stat.totalTokens.toLocaleString()}`,
        `  Avg tokens/call: ${stat.avgTokensPerCall}`,
        `  Total cost: $${stat.totalCost.toFixed(6)}`,
        `  Avg cost/call: $${stat.avgCostPerCall.toFixed(6)}`
      );
    }

    const grandTotal = Object.values(stats).reduce(
      (acc: any, stat: any) => ({
        calls: acc.calls + stat.calls,
        totalTokens: acc.totalTokens + stat.totalTokens,
        totalCost: acc.totalCost + stat.totalCost,
      }),
      { calls: 0, totalTokens: 0, totalCost: 0 }
    );

    lines.push(
      '\n' + '='.repeat(80),
      'TOTAL:',
      `  Calls: ${grandTotal.calls}`,
      `  Total tokens: ${grandTotal.totalTokens.toLocaleString()}`,
      `  Total cost: $${grandTotal.totalCost.toFixed(6)}`,
      '\n'
    );

    return lines.join('\n');
  }
}

// Provider configs
const PROVIDERS = {
  anthropic: {
    model: 'claude-haiku-4-5-20251001',
    inputCostPerToken: 0.80 / 1_000_000,  // $0.80/1M input
    outputCostPerToken: 4.00 / 1_000_000,  // $4.00/1M output
  },
  openai: {
    model: 'gpt-5-nano',
    inputCostPerToken: 0.05 / 1_000_000,
    outputCostPerToken: 0.40 / 1_000_000,
  },
} as const;

function detectProvider(): { provider: Provider; apiKey: string } {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) return { provider: 'anthropic', apiKey: anthropicKey };
  if (openaiKey) return { provider: 'openai', apiKey: openaiKey };

  throw new Error(
    'No API key found. Set one of:\n\n' +
    '   ANTHROPIC_API_KEY=sk-ant-...   (recommended for Claude Code users)\n' +
    '   OPENAI_API_KEY=sk-proj-...     (OpenAI)\n\n' +
    '   Add to .env file or export as environment variable.\n' +
    '   Get keys from:\n' +
    '     Anthropic: https://console.anthropic.com/settings/keys\n' +
    '     OpenAI:    https://platform.openai.com/api-keys'
  );
}

/**
 * Unified AI client. Auto-detects provider from available API keys.
 * Supports both Anthropic (Claude) and OpenAI with identical interface.
 */
export class OpenAIClient {
  private provider: Provider;
  private apiKey: string;
  private tokenTracker: TokenTracker;
  private anthropicClient: any;
  private openaiClient: any;

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

  private async getAnthropicClient() {
    if (!this.anthropicClient) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this.anthropicClient = new Anthropic({ apiKey: this.apiKey });
    }
    return this.anthropicClient;
  }

  private async getOpenAIClient() {
    if (!this.openaiClient) {
      const { default: OpenAI } = await import('openai');
      this.openaiClient = new OpenAI({ apiKey: this.apiKey });
    }
    return this.openaiClient;
  }

  private trackUsage(promptType: string, inputTokens: number, outputTokens: number): void {
    const config = PROVIDERS[this.provider];
    const usage: TokenUsage = {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      cost: inputTokens * config.inputCostPerToken + outputTokens * config.outputCostPerToken,
    };
    this.tokenTracker.track(promptType, usage);
  }

  private async callAnthropic(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const client = await this.getAnthropicClient();
    const response = await client.messages.create({
      model: PROVIDERS.anthropic.model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    return {
      content,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    responseFormat?: 'json_object' | 'text'
  ): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
    const client = await this.getOpenAIClient();
    const response = await client.chat.completions.create({
      model: PROVIDERS.openai.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_completion_tokens: maxTokens,
      response_format: responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
    });

    const content = response.choices[0]?.message?.content || '';
    return {
      content,
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
    };
  }

  async callStructured<T = any>(
    promptType: string,
    systemPrompt: string,
    userPrompt: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: 'json_object' | 'text';
    } = {}
  ): Promise<T> {
    const { maxTokens = 2500, responseFormat = 'json_object' } = options;

    // For Anthropic, add JSON instruction to system prompt when JSON is requested
    const effectiveSystemPrompt =
      this.provider === 'anthropic' && responseFormat === 'json_object'
        ? systemPrompt + '\n\nIMPORTANT: Respond with valid JSON only. No other text.'
        : systemPrompt;

    try {
      let result: { content: string; inputTokens: number; outputTokens: number };

      if (this.provider === 'anthropic') {
        result = await this.callAnthropic(effectiveSystemPrompt, userPrompt, maxTokens);
      } else {
        result = await this.callOpenAI(effectiveSystemPrompt, userPrompt, maxTokens, responseFormat);
      }

      this.trackUsage(promptType, result.inputTokens, result.outputTokens);

      if (!result.content) {
        throw new Error(`No content in response from ${this.provider} API`);
      }

      if (responseFormat === 'json_object') {
        // Extract JSON from response (handles markdown code blocks)
        let jsonStr = result.content.trim();
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) jsonStr = jsonMatch[1].trim();

        try {
          return JSON.parse(jsonStr) as T;
        } catch (parseError) {
          throw new Error(`Failed to parse JSON response: ${jsonStr.substring(0, 200)}...`);
        }
      }

      return result.content as T;
    } catch (error: any) {
      if (error.code === 'insufficient_quota' || error.status === 429) {
        throw new Error(
          `${this.provider} API quota exceeded.\n\n` +
          '   Add credits to your account.'
        );
      }

      if (error.code === 'invalid_api_key' || error.status === 401) {
        throw new Error(
          `Invalid ${this.provider} API key.\n\n` +
          '   Check your .env file and verify the API key is correct.'
        );
      }

      if (error.message?.includes('ENOTFOUND') || error.message?.includes('ECONNREFUSED')) {
        throw new Error(
          `Cannot connect to ${this.provider} API.\n\n` +
          '   Check your internet connection and try again.'
        );
      }

      throw error;
    }
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
