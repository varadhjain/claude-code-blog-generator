/**
 * MCP Server — serves extracted learnings to other Claude Code agents.
 *
 * Tools:
 *   search_learnings(query, tags?, language?) — hybrid keyword + tag search
 *   get_learning(id) — full learning record
 *   list_recent(n?) — latest N learnings
 *   submit_feedback(id, useful) — update importance score
 *
 * Start: ccblog serve
 * Config in ~/.claude/settings.json:
 *   { "mcpServers": { "ccblog": { "command": "ccblog", "args": ["serve"] } } }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { loadLearnings, updateLearning, type Learning } from './extractor';

// In-memory cache to avoid re-reading all files on every request
let learningsCache: Learning[] | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 60_000; // refresh every 60s

async function getCachedLearnings(): Promise<Learning[]> {
  if (!learningsCache || Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    learningsCache = await loadLearnings();
    cacheLoadedAt = Date.now();
  }
  return learningsCache;
}

function invalidateCache() {
  learningsCache = null;
}

async function startServer() {
  const server = new Server(
    { name: 'ccblog', version: '1.0.0' },
    {
      capabilities: {
        tools: {},
      },
      instructions: 'Search learnings extracted from past Claude Code sessions. Use search_learnings when you encounter errors, need patterns, or want to check if a problem has been solved before.',
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'search_learnings',
        description: 'Search past session learnings by problem description, error message, or topic. Returns matching solutions, pitfalls, and patterns from previous Claude Code sessions.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            query: { type: 'string' as const, description: 'Search query — error message, problem description, or topic' },
            tags: { type: 'array' as const, items: { type: 'string' as const }, description: 'Filter by tags (e.g., ["typescript", "openai"])' },
            language: { type: 'string' as const, description: 'Filter by programming language' },
            limit: { type: 'number' as const, description: 'Max results (default 5)' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_learning',
        description: 'Get the full details of a specific learning by ID.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            id: { type: 'string' as const, description: 'Learning ID' },
          },
          required: ['id'],
        },
      },
      {
        name: 'list_recent',
        description: 'List the most recent learnings extracted from sessions.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            limit: { type: 'number' as const, description: 'Number of learnings to return (default 10)' },
          },
        },
      },
      {
        name: 'submit_feedback',
        description: 'Report whether a learning was useful. Improves future search ranking.',
        inputSchema: {
          type: 'object' as const,
          properties: {
            id: { type: 'string' as const, description: 'Learning ID' },
            useful: { type: 'boolean' as const, description: 'Was this learning helpful?' },
          },
          required: ['id', 'useful'],
        },
      },
    ],
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const toolArgs = (args || {}) as Record<string, any>;

    switch (name) {
      case 'search_learnings': {
        const learnings = await getCachedLearnings();
        const query = (toolArgs.query || '').toLowerCase();
        const tagFilter = toolArgs.tags as string[] | undefined;
        const langFilter = toolArgs.language as string | undefined;
        const limit = toolArgs.limit || 5;

        const scored = learnings.map(l => {
          let score = 0;

          // Keyword matching on problem, root_cause, solution
          const searchableText = `${l.problem} ${l.root_cause} ${l.solution} ${l.trigger_conditions}`.toLowerCase();
          const queryWords = query.split(/\s+/).filter(Boolean);
          for (const word of queryWords) {
            if (searchableText.includes(word)) score += 1;
          }

          // Exact phrase bonus
          if (searchableText.includes(query)) score += 3;

          // Tag matching
          if (tagFilter) {
            const matchingTags = tagFilter.filter(t => l.tags.includes(t.toLowerCase()));
            score += matchingTags.length * 2;
          }

          // Language filter
          if (langFilter && l.languages.includes(langFilter.toLowerCase())) {
            score += 1;
          }

          // Recency boost BEFORE importance multiplier
          const ageMs = Date.now() - new Date(l.created_at).getTime();
          if (ageMs < 7 * 86400 * 1000) score += 1;

          // Importance weighting (applied last, scales everything uniformly)
          score *= l.importance;

          return { learning: l, score };
        });

        // Require at least some keyword/tag signal (not just recency)
        const results = scored
          .filter(s => s.score > s.learning.importance) // recency alone (1 * importance) isn't enough
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(s => formatLearning(s.learning, s.score));

        return {
          content: [{
            type: 'text',
            text: results.length > 0
              ? `Found ${results.length} relevant learning(s):\n\n${results.join('\n---\n')}`
              : 'No matching learnings found.',
          }],
        };
      }

      case 'get_learning': {
        const learnings = await getCachedLearnings();
        const learning = learnings.find(l => l.id === toolArgs.id);

        if (!learning) {
          return { content: [{ type: 'text', text: `Learning ${toolArgs.id} not found.` }] };
        }

        // Track retrieval
        await updateLearning(toolArgs.id, {
          times_retrieved: learning.times_retrieved + 1,
        });
        invalidateCache();

        return {
          content: [{ type: 'text', text: JSON.stringify(learning, null, 2) }],
        };
      }

      case 'list_recent': {
        const learnings = await getCachedLearnings();
        const limit = toolArgs.limit || 10;
        const recent = learnings.slice(0, limit);

        const summaries = recent.map(l =>
          `• [${l.type}] ${l.problem.substring(0, 100)} (${l.source_date}, tags: ${l.tags.join(', ')})\n  ID: ${l.id}`
        );

        return {
          content: [{
            type: 'text',
            text: recent.length > 0
              ? `${recent.length} recent learning(s):\n\n${summaries.join('\n\n')}`
              : 'No learnings found. Run `ccblog extract <session.jsonl>` to extract learnings from a session.',
          }],
        };
      }

      case 'submit_feedback': {
        const learnings = await getCachedLearnings();
        const learning = learnings.find(l => l.id === toolArgs.id);

        if (!learning) {
          return { content: [{ type: 'text', text: `Learning ${toolArgs.id} not found.` }] };
        }

        const importanceDelta = toolArgs.useful ? 0.1 : -0.1;
        const newImportance = Math.max(0.3, learning.importance + importanceDelta);
        await updateLearning(toolArgs.id, {
          importance: newImportance,
          times_useful: learning.times_useful + (toolArgs.useful ? 1 : 0),
        });
        invalidateCache();

        return {
          content: [{
            type: 'text',
            text: `Feedback recorded. Importance: ${learning.importance.toFixed(1)} → ${newImportance.toFixed(1)}`,
          }],
        };
      }

      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}` }] };
    }
  });

  // Start
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

function formatLearning(l: Learning, score: number): string {
  return `**${l.type.toUpperCase()}** (relevance: ${score.toFixed(1)}, importance: ${l.importance.toFixed(1)})
**Problem**: ${l.problem}
**Root cause**: ${l.root_cause}
**Solution**: ${l.solution}${l.what_didnt_work?.length ? `\n**What didn't work**: ${l.what_didnt_work.join('; ')}` : ''}
**Trigger**: ${l.trigger_conditions}
**Tags**: ${l.tags.join(', ')}
**Files**: ${l.files_touched.join(', ')}
ID: ${l.id}`;
}

export { startServer };
