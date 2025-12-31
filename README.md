# Claude Code Session Analyzer

Turn your Claude Code conversations into shareable, annotated HTML viewers.

## Quick Start - Annotated Viewer

The annotated viewer analyzes your Claude Code sessions and generates an interactive HTML viewer with:
- Color-coded key moments (new tasks, clarifications, pivots)
- Phase detection (setup, debugging, refactoring, etc.)
- Timeline navigation with clickable moments
- Paginated messages with collapsible content
- Automatic upload to GitHub Gist

### Usage

```bash
# Interactive mode - choose project and session
npm run annotate

# Direct file mode - convert to markdown
npx ts-node ccblog.ts ~/.claude/projects/my-project/session-123.jsonl > output.md

# Help
npx ts-node ccblog.ts --help
```

### What Happens

1. **Select a session**: Pick from your `~/.claude/projects/` conversations
2. **AI Analysis**: Two-pass analysis detects phases and annotates key messages
3. **HTML Generation**: Creates index.html (summary) + paginated conversation pages
4. **Gist Upload**: Uploads to GitHub and gives you a preview URL

### Example Output

After running `npm run annotate`, you'll see:

```
✅ Analysis complete!
   🟢 5 new tasks
   🟡 3 clarifications
   🔴 1 pivots
   📋 4 phases detected

📄 Generating annotated HTML...
✅ HTML generated!
   📊 4 pages created

☁️  Uploading to Gist...
✅ Shared!

🔗 Gist URL: https://gist.github.com/...
👁️  Preview: https://bl.ocks.org/.../index.html

💡 Tip: Open the preview URL to view the annotated session with collapsible messages and key moments timeline.
```

The preview URL shows an interactive viewer where:
- **index.html** = Summary page with stats, timeline, and phase overview
- **page-001.html** = First 50 messages of the conversation
- **page-002.html** = Next 50 messages, etc.
- Key moments are highlighted and clickable from the timeline

### Cost

- ~$0.0017 per session (using gpt-4o-mini)
- Typical 200-message session costs less than a penny

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
# Install dependencies
npm install

# Add OpenAI key (required for AI analysis)
echo "OPENAI_API_KEY=sk-proj-..." > .env

# Authenticate GitHub CLI (required for Gist upload)
gh auth login
```

### Requirements

- **Node.js** 18+ or **Bun** runtime
- **OpenAI API key** - Get one at https://platform.openai.com/api-keys
- **GitHub CLI** - Install with `brew install gh` (macOS) or see https://cli.github.com/
- **Claude Code** - Must have run at least one session to have `.jsonl` files in `~/.claude/projects/`

## Troubleshooting

### "No Claude Code projects found"
- Make sure you've run Claude Code at least once: `c` or `claude-code`
- Check that `~/.claude/projects/` exists and contains project directories

### "OPENAI_API_KEY not found"
- Create a `.env` file in the project root
- Add your key: `OPENAI_API_KEY=sk-proj-...`
- Get a key at https://platform.openai.com/api-keys

### "gh: command not found" or Gist upload fails
- Install GitHub CLI: `brew install gh` (macOS) or visit https://cli.github.com/
- Authenticate: `gh auth login`
- Make sure you grant the `gist` scope when authenticating

### Analysis is slow or expensive
- The tool uses gpt-4o-mini (very cheap and fast)
- A typical 200-message session costs < $0.002
- If you have a very long session (500+ messages), it may take 10-30 seconds

### HTML viewer doesn't render properly
- GitHub Gist has a file size limit (1MB per file)
- Very long sessions may need to be split into more pages
- Try using the preview URL (bl.ocks.org) instead of the raw Gist URL

## Architecture

**Key Files:**
- `ccblog.ts` - Main CLI tool (interactive + direct file mode)
- `src/user-annotations.ts` - Two-pass AI analysis (phase detection + annotation)
- `src/annotated-viewer/generator.ts` - HTML generation with Handlebars templates
- `src/gist-uploader.ts` - GitHub Gist upload via gh CLI
- `src/annotated-viewer/templates/` - Handlebars templates for HTML output

## Next Steps

See [HANDOFF.md](HANDOFF.md) for vision & roadmap (AmpCode-style viewer)

## Tech Stack

- **TypeScript** - Type-safe development
- **gpt-4o-mini** - Cost-effective AI analysis
- **Handlebars** - HTML templating
- **marked** - Markdown to HTML conversion
- **GitHub CLI** - Gist upload and sharing

## License

MIT
