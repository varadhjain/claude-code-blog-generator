# Blog Post Generator - Claude Code Instructions

## AI Model Policy

**CRITICAL**: This project uses **gpt-5-nano ONLY** for all AI operations.

- ✅ **USE**: `gpt-5-nano` (model name in OpenAI API)
- ❌ **DO NOT USE**: Any other models (GPT-4, GPT-4o, gpt-4o-mini, Claude, etc.)

**Pricing**: $0.05/1M input tokens, $0.40/1M output tokens
**Target cost**: < $0.01 per session analysis

## Project Goal

Convert Claude Code session transcripts (`.jsonl` files) into educational blog posts automatically.

**Input**: `~/.claude/projects/[project]/[session-id].jsonl`
**Output**: Publishable blog posts in multiple narrative styles

## Supported Blog Templates

1. **Mitchell Hashimoto Style** - Personal, reflective narrative (problem → solution → lessons)
2. **Tutorial Style** - Step-by-step, reproducible instructions
3. **Session Archaeology** - Analytical, investigative, data-driven
4. **Technical Deep Dive** - Code-heavy, focused on specific implementation
5. **Quick Win / TIL** - Short, punchy posts about single insights (for small sessions)
6. **Case Study** - Problem → Investigation → Solution (for debugging sessions)

## Architecture

```
JSONL Session (raw transcript)
    ↓
Session Digest Builder (extract 3k token summary)
    ↓
Meta-Analysis (gpt-5-nano: identify goal, phases, best template)
    ↓
Guided Phase Classification (gpt-5-nano: detailed analysis of key sections)
    ↓
Blog Post Generation (assemble narrative)
    ↓
Markdown Output
```

## Development Commands

```bash
# Install dependencies
npm install

# Test meta-analysis on example session
npx ts-node scripts/test-meta-analysis.ts

# Test phase classification
npx ts-node scripts/test-phase-classification.ts

# Convert JSONL to simplified markdown
npx ts-node scripts/jsonl-to-markdown.ts examples/session.jsonl

# Run full test suite
npm test
```

## Environment Setup

Required in `.env`:
```
OPENAI_API_KEY=sk-proj-...
```

## Key Technical Decisions

1. **gpt-5-nano**: Ultra-low-cost, fast model perfect for high-volume analysis
2. **Two-stage analysis**: Meta-analysis first (goal, structure) → detailed classification second
3. **Session digest**: Pre-process JSONL into 3k token summary (saves 85-90% on costs)
4. **TypeScript**: Type safety for complex JSONL parsing
5. **6 blog templates**: Different narrative styles for different session types

## Development Guidelines

1. **ALWAYS use gpt-5-nano** - Never deviate from this
2. **Track all token usage** - Every API call must log tokens and cost
3. **Optimize before calling LLM** - Pre-process, summarize, deduplicate
4. **Test on real sessions** - Use actual Claude Code transcripts
5. **Iterate prompts** - Measure, refine, re-test

## Cost Tracking

With gpt-5-nano pricing ($0.05/$0.40 per 1M tokens):

| Operation | Tokens | Cost | Notes |
|-----------|--------|------|-------|
| Meta-analysis | ~4k | ~$0.0003 | One per session |
| Phase classification | ~500 | ~$0.00003 | Per 5-message window |
| Full session (149 msgs) | ~11k total | **~$0.001** | Well under $0.01 target |

## Files & Structure

```
blog-post-generator/
├── src/
│   ├── ai/
│   │   └── client.ts              # OpenAI wrapper, token tracking
│   ├── prompts/
│   │   ├── meta-analysis.ts       # High-level session analysis
│   │   ├── phase-classification.ts
│   │   ├── phase-summary.ts
│   │   └── decision-detection.ts
│   ├── analyzer/
│   │   └── digest-builder.ts      # Extract session summaries
│   └── types/
│       └── index.ts
├── scripts/
│   ├── test-meta-analysis.ts
│   ├── test-phase-classification.ts
│   ├── jsonl-to-markdown.ts
│   └── analyze_session.py
├── examples/
│   └── blog-post-generator-transcript.jsonl
├── docs/
│   ├── NARRATIVE_EXAMPLES.md
│   └── SESSION_FILE_FORMAT.md
├── .env                          # API keys (gitignored)
└── CLAUDE.md                     # THIS FILE
```

## Current Status

✅ **Done**:
- gpt-5-nano client integration
- Phase classification prompt
- JSONL parser
- 6 blog template definitions

🚧 **In Progress**:
- Meta-analysis prompt
- Session digest builder
- Two-stage analysis pipeline

📋 **Next**:
- Blog post assembly
- PII redaction
- CLI tool

## Testing

```bash
# Expected: Meta-analysis identifies session goal, suggests template
npx ts-node scripts/test-meta-analysis.ts

# Expected: 90%+ accuracy on phase classification
npx ts-node scripts/test-phase-classification.ts
```

## References

- Mitchell Hashimoto's blog: https://mitchellh.com/writing/non-trivial-vibing
- AmpCode threads: https://ampcode.com/news/read-threads
- OpenAI gpt-5-nano docs: https://platform.openai.com/docs/models/gpt-5-nano
