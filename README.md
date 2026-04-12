# ccblog

**Turn your Claude Code sessions into publishable developer content. Automatically.**

[![npm version](https://img.shields.io/npm/v/claude-code-blog-generator)](https://www.npmjs.com/package/claude-code-blog-generator)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

---

## Why?

You just spent 2 hours building something cool with Claude Code. The session had great decision moments, clever pivots, real debugging stories. But the `.jsonl` file sitting in `~/.claude/projects/` is unreadable, and you'll never turn it into a blog post manually.

**ccblog** reads your Claude Code sessions and generates publishable blog posts + interactive HTML viewers with one command. AI detects the phases, key decisions, and narrative arc. Upload to Gist, cross-post to Dev.to, or just keep drafts accumulating automatically.

## Quick Start

```bash
npm install -g claude-code-blog-generator
ccblog --setup    # guided setup (picks your AI provider)
ccblog            # interactive session picker
```

Works with **Anthropic** (Claude Haiku) or **OpenAI** (gpt-5-nano). Uses whichever API key you have. Cost: ~$0.001 per session.

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

## Usage

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
- **API key** — Anthropic or OpenAI
- **GitHub CLI** (optional) — for Gist upload (`brew install gh`)

## Security

- API keys read from `.env` or environment (never hardcoded or logged)
- `.env` and `.jsonl` files are gitignored
- PII redaction available for all published content
- Review generated files before uploading — sessions may contain sensitive code

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
