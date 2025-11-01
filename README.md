# Claude Code Blog Post Generator

Convert Claude Code sessions into educational blog posts with intelligent narrative chunking.

## What It Does

Parses `~/.claude/projects/[session].jsonl` → Detects phases (Setup, Coding, Debugging) → Generates blog post

**Key Innovation**: Semantic chunking instead of chronological messages.

```
Instead of:  Message 1 → Message 2 → Message 3...
We create:   Setup (1-3) → Coding (4-10) → Bug Fix (11-15)
```

## Install

```bash
npm install
npm run build
```

## Usage

```bash
# Generate blog post
blog-post-generator generate <session-id>

# List available sessions
blog-post-generator list
```

## For Developers

**Read these docs in order:**

1. **[PROJECT.md](./PROJECT.md)** - Core concept (5 min read)
2. **[MILESTONES.md](./MILESTONES.md)** - 8 milestones to build independently
3. **[PROGRESS.md](./PROGRESS.md)** - Track what's done

**Quick Start:**
```bash
git clone https://github.com/varadhjain/claude-code-blog-generator.git
cd claude-code-blog-generator
npm install
npm run dev  # Watch mode
npm test     # Run tests
```

Pick a milestone from `MILESTONES.md`, claim it in `PROGRESS.md`, and build it.

## Tech Stack

- TypeScript 5.x
- GPT-5-nano for phase detection ($0.024/session)
- yargs for CLI
- Jest for testing

## License

MIT
