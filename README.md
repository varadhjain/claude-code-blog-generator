# Claude Code Session Analyzer

Two tools: User annotations + Blog generation

## 1. User Message Annotations (NEW)

**Analyze Claude Code sessions with AI**

```bash
npm run annotate
```

- Two-pass analysis (phase detection → contextual annotation)
- Color-coded messages: 🟢 New task | 🟡 Steering | 🔴 Restart
- Per-message reasoning
- Upload to GitHub Gist (Markdown)
- Cost: ~$0.0017 per session (gpt-4o-mini)

**Files:**
- `src/user-annotations.ts` - All logic
- `src/gist-uploader.ts` - Gist upload via gh CLI

## 2. Blog Post Generation (ORIGINAL)

**Convert sessions to blog posts**

```bash
npm run sidebar    # Generate sidebar
npm run workflow   # Interactive mode
```

**Files:**
- `scripts/blog-generation/` - CLI tools
- `src/analyzer/blog-generation/` - Analysis
- `src/prompts/blog-generation/` - AI prompts

## Setup

```bash
npm install

# Add OpenAI key
echo "OPENAI_API_KEY=sk-proj-..." > .env

# For Gist upload
gh auth login
```

## Next Steps

See [HANDOFF.md](HANDOFF.md) for vision & roadmap (AmpCode-style viewer)

## Tech

- TypeScript
- gpt-4o-mini
- gh CLI (for Gists)

## License

MIT
