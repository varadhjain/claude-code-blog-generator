# ccblog

**A Claude Code session toolkit: search, distill, and publish your history.**

[![GitHub stars](https://img.shields.io/github/stars/varadhjain/claude-code-blog-generator)](https://github.com/varadhjain/claude-code-blog-generator)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## Why?

Your `~/.claude/projects/` is hundreds of megabytes of `.jsonl` transcripts — unsearchable, unreadable, and expensive to point Claude at. `ccblog` turns that archive into something useful:

- 🔎 **Search** — BM25 full-text search over every past session. Sub-ms queries. No API key needed.
- 🧠 **Learn** — extract structured learnings from sessions so future agents can query "have we solved this before?"
- ✍️ **Publish** — generate polished blog posts + interactive HTML viewers from any session.

All local. All optional. Search works offline with zero network calls.

## Quick Start

```bash
npm install -g github:varadhjain/claude-code-blog-generator

# Search (no API key required — fully local BM25 over SQLite FTS5)
ccblog index                 # one-time: build the search index
ccblog search "auth bug"     # find past sessions by topic
ccblog watch                 # keep the index live-updated

# Learn + publish (requires an API key)
ccblog --setup               # picks Anthropic or OpenAI
ccblog                       # interactive: session → blog post
```

Search is free and instant. Blog/learn features use **Anthropic** (Claude Haiku) or **OpenAI** (gpt-5-nano) at ~$0.001/session.

## What You Get

```
Session .jsonl  →  ccblog  →  4 files:
                              ├── SUMMARY.md      Narrative blog post
                              ├── summary.html    Formatted blog
                              ├── index.html      Interactive annotated viewer
                              └── page-*.html     Paginated full conversation
```

**Blog summary** includes:
- Session goal and outcome (synthesized, not just copied)
- ASCII flow diagram
- Phases with specific names like *"Fixing token exhaustion: 1000→8000 tokens"*
- Key prompts color-coded: new task / steering / pivot
- Code snippets from tool uses
- Deep links to exact conversation moments

**[See a live example →](https://gistpreview.github.io/?403f012649b153984ff46284e8cfc430/index.html)**

## Search (no API key)

BM25 full-text index over every session in `~/.claude/projects/`. Sub-ms queries. Zero network calls. The index lives at `~/.ccblog/session-index.db` and filters out `tool_result` blobs (which make JSONL huge but rarely help search).

```bash
ccblog index                           # build/update the index (incremental)
ccblog watch                           # initial index + live tail on JSONL appends
ccblog search "jwt middleware"         # BM25 search — ranked results + snippets
ccblog files "src/auth/middleware.ts"  # every session that touched a file
ccblog sessions                        # 20 most recent sessions
```

**Tuning:** four BM25 field weights in `src/search/weights.ts` control ranking (user text, assistant text, tool calls, file paths). No reindex needed after changes.

**As an MCP server** (one server, all tools — search + learnings):

```json
{
  "mcpServers": {
    "ccblog": { "command": "ccblog", "args": ["serve"] }
  }
}
```

Exposes `search_sessions`, `read_session_window`, `list_sessions_by_file`, `list_recent_sessions` alongside the existing learnings tools. Tool descriptions instruct Claude not to persist snippets to `MEMORY.md`.

## Usage — blog generation

```bash
# Interactive mode — pick a session, analyze, upload to Gist
ccblog

# Auto mode — analyze latest session, save draft (great for hooks)
ccblog --auto --quiet --redact

# Setup wizard
ccblog --setup

# Help
ccblog --help
```

### Auto-capture with hooks

Generate a blog draft after every Claude Code session — zero effort:

Add to `~/.claude/settings.json`:
```json
{
  "hooks": {
    "PostSessionStop": [{
      "command": "ccblog --auto --quiet --redact"
    }]
  }
}
```

Drafts accumulate in `~/.ccblog/drafts/`. Review and publish when ready.

### PII Redaction

`--redact` scans for and replaces:
- API keys (Anthropic, OpenAI, AWS, GitHub)
- Email addresses
- IP addresses
- Home directory paths (`/Users/yourname/`)
- Database connection strings
- Private keys

Auto-prompted when uploading to Gist even without the flag.

## How It Works

**Two-pass AI analysis:**

1. **Phase detection** — Identifies task boundaries and generates specific, action-oriented phase names
2. **Contextual annotations** — Color-codes each message:
   - 🟢 New task start
   - 🟡 Clarification / steering
   - 🔴 Pivot / major change

**Smart summarization** extracts goals, outcomes, key prompts, and code snippets. Generates deep links from summary to specific conversation messages.

## Multi-Provider Support

Uses whichever API key is available (checks in order):

| Provider | Model | Cost/session | Env var |
|----------|-------|-------------|---------|
| **Anthropic** | Claude Haiku 4.5 | ~$0.002 | `ANTHROPIC_API_KEY` |
| **OpenAI** | gpt-5-nano | ~$0.001 | `OPENAI_API_KEY` |

Set in `.env` file or environment. The setup wizard (`ccblog --setup`) walks you through it.

## Requirements

- **Node.js** 18+
- **API key** — Anthropic or OpenAI (only for blog/learn features; search works without)
- **GitHub CLI** (optional) — for Gist upload (`brew install gh`)

## Privacy & Security

**Search is fully local.** `ccblog index`, `ccblog watch`, and all `search_*` MCP tools make **zero network calls**. Your session transcripts never leave your machine for these paths. The index lives at `~/.ccblog/session-index.db` (SQLite) and only stores filtered message text — `tool_result` blobs are dropped at ingest time.

**Blog / learnings features are opt-in and use an API key you control.** API keys are read from `.env` or the environment (never hardcoded or logged). `.env` and `.jsonl` files are gitignored. PII redaction is available for all published content.

**Review generated files before uploading** — sessions may contain sensitive code or credentials.

**Uninstall:** `rm -rf ~/.ccblog` clears everything this tool stored.

## Development

```bash
git clone https://github.com/varadhjain/claude-code-blog-generator.git
cd claude-code-blog-generator
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env   # or OPENAI_API_KEY
npm run build
npm link
ccblog
```

## License

MIT

---

*Turn your best Claude Code sessions into content the world can learn from.*
