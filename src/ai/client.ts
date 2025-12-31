/**
 * OpenAI client wrapper with token tracking
 */

import OpenAI from 'openai';
import * as dotenv from 'dotenv';

dotenv.config();

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

    // Grand total
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

export class OpenAIClient {
  private client: OpenAI;
  private tokenTracker: TokenTracker;

  // gpt-5-nano pricing (August 2025)
  // Input: $0.05 per 1M tokens
  // Output: $0.40 per 1M tokens
  private readonly INPUT_COST_PER_TOKEN = 0.05 / 1_000_000;
  private readonly OUTPUT_COST_PER_TOKEN = 0.4 / 1_000_000;

  constructor(tokenTracker?: TokenTracker) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY not found in environment variables.\n\n' +
        '   Create a .env file in the project root:\n' +
        '     OPENAI_API_KEY=sk-proj-...\n\n' +
        '   Get your API key from: https://platform.openai.com/api-keys'
      );
    }

    this.client = new OpenAI({ apiKey });
    this.tokenTracker = tokenTracker || new TokenTracker();
  }

  getTokenTracker(): TokenTracker {
    return this.tokenTracker;
  }

  /**
   * Call gpt-5-nano with structured JSON response
   */
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
    const {
      maxTokens = 1000,
      responseFormat = 'json_object',
    } = options;

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-5-nano',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        // gpt-5-nano only supports temperature=1 (default), so we omit it
        max_completion_tokens: maxTokens, // gpt-5-nano uses max_completion_tokens
        response_format: responseFormat === 'json_object' ? { type: 'json_object' } : undefined,
      });

      const usage = response.usage;
      if (usage) {
        const tokenUsage: TokenUsage = {
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          cost:
            usage.prompt_tokens * this.INPUT_COST_PER_TOKEN +
            usage.completion_tokens * this.OUTPUT_COST_PER_TOKEN,
        };
        this.tokenTracker.track(promptType, tokenUsage);
      }

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content in response from OpenAI API');
      }

      if (responseFormat === 'json_object') {
        try {
          return JSON.parse(content) as T;
        } catch (parseError) {
          throw new Error(`Failed to parse JSON response: ${content.substring(0, 200)}...`);
        }
      }

      return content as T;
    } catch (error: any) {
      // Enhance error messages for common issues
      if (error.code === 'insufficient_quota') {
        throw new Error(
          'OpenAI API quota exceeded.\n\n' +
          '   Your OpenAI account has run out of credits.\n' +
          '   Add credits at: https://platform.openai.com/account/billing'
        );
      }

      if (error.code === 'invalid_api_key' || error.status === 401) {
        throw new Error(
          'Invalid OpenAI API key.\n\n' +
          '   Check your .env file and verify the API key is correct.\n' +
          '   Get a new key at: https://platform.openai.com/api-keys'
        );
      }

      if (error.code === 'model_not_found') {
        throw new Error(
          'Model gpt-5-nano not found.\n\n' +
          '   This model might not be available yet or your account may not have access.\n' +
          '   Check OpenAI model availability at: https://platform.openai.com/docs/models'
        );
      }

      if (error.message?.includes('ENOTFOUND') || error.message?.includes('ECONNREFUSED')) {
        throw new Error(
          'Cannot connect to OpenAI API.\n\n' +
          '   Check your internet connection and try again.'
        );
      }

      // Re-throw with original message if no specific handler
      throw error;
    }
  }

  /**
   * Call gpt-5-nano with text response
   */
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
