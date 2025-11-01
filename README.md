# Claude Code Blog Post Generator

Convert Claude Code session transcripts into narrative blog posts with citation support.

## What It Does

Parses `.jsonl` session files → Extracts narrative elements (approach, problems, learnings) → Generates sidebar with message citations

**Output**: A sidebar markdown file with:
- Session goal & approach
- Problems encountered (with resolution paths)
- What went well (velocity, elegance, efficiency)
- Evidence-backed learnings
- Interesting moments & potential titles
- **Message references** for linking narrative back to source

## Quick Start

See **[SETUP.md](./SETUP.md)** for complete setup instructions.

```bash
npm install

# Create .env with your OpenAI API key
echo "OPENAI_API_KEY=sk-proj-your-key" > .env

# Generate sidebar for a session
npm run workflow sample-sessions/your-session.jsonl

# Auto-opens generated sidebar in output/
```

## Cost

~$0.002 per session using gpt-5-nano ($0.05/$0.40 per 1M tokens)

## For Developers

1. **[PROJECT.md](./PROJECT.md)** - Core concept
2. **[MILESTONES.md](./MILESTONES.md)** - Work breakdown
3. **[SETUP.md](./SETUP.md)** - Setup & usage guide

## Tech Stack

- TypeScript 5.x
- GPT-5-nano for phase detection ($0.024/session)
- yargs for CLI
- Jest for testing

## License

MIT
