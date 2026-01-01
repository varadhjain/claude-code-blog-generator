# Claude Code Blog Generator

Transform your Claude Code sessions into shareable blog posts and annotated HTML viewers — perfect for teams documenting "what we built and how we did it."

**✨ Features:**
- 🤖 AI-powered session analysis (detects phases, key prompts, decisions)
- 📝 Generates blog summaries (Markdown + HTML)
- 🎨 Beautiful annotated HTML viewer with timeline navigation
- 🔗 Deep links from summary to specific conversation moments
- ☁️ One-click upload to GitHub Gist for easy sharing
- 💰 Ultra-low cost (~$0.001 per session using gpt-5-nano)

## Quick Start

### Option 1: Guided Setup (Recommended)

```bash
# Install
npm install -g claude-code-blog-generator

# Run setup wizard
ccblog --setup
```

The wizard will:
- ✅ Check Node.js version
- ✅ Help you set up your OpenAI API key
- ✅ Test the API connection
- ✅ Check for GitHub CLI (optional)
- ✅ Verify Claude Code sessions exist

### Option 2: Manual Setup

```bash
# Install
npm install -g claude-code-blog-generator

# Set up API key
echo "OPENAI_API_KEY=sk-proj-..." > .env

# Run
ccblog
```

Get your OpenAI API key at https://platform.openai.com/api-keys

That's it! The interactive TUI will:
- ✅ Auto-discover all your Claude Code sessions
- ✅ Let you pick which one to analyze
- ✅ Run AI analysis (2-pass: phase detection → contextual annotations)
- ✅ Generate blog summary + annotated HTML viewer
- ✅ Upload to GitHub Gist (optional)

## What You Get

After analysis, you get 4 files:

### 1. `SUMMARY.md` - Quick Blog Post
Narrative-driven summary with:
- Session goal and outcome
- ASCII diagram showing session flow
- Key phases with specific, action-oriented names
- Important prompts and decisions
- Code snippets
- Deep links to full session

**Example phase names:**
- ✅ "Fixing gpt-5-nano token exhaustion: increasing from 1000→8000 tokens for reasoning overhead"
- ✅ "Replacing Mermaid with ASCII diagrams after GistPreview blocked external scripts"
- ✅ "Debugging duplicate \<style\> tags that broke HTML rendering"

### 2. `summary.html` - Formatted Blog Summary
Beautiful HTML version of the blog summary with syntax highlighting

### 3. `index.html` - Annotated Session Viewer
Interactive HTML viewer with:
- Timeline of key moments (color-coded: 🟢 new tasks, 🟡 clarifications, 🔴 pivots)
- Phase navigation
- Collapsible messages
- Search and filter

### 4. `page-XXX.html` - Paginated Conversation
Full conversation split into digestible 50-message pages with:
- Syntax-highlighted code blocks
- Tool use/result blocks
- Deep-linkable messages (#msg-142)

## Usage

### Commands

```bash
ccblog              # Start interactive session picker
ccblog --setup      # Run setup wizard
ccblog --help       # Show help
```

### Interactive Mode (recommended)

```bash
ccblog
```

The TUI will guide you through:
1. Picking a session from your `~/.claude/projects/` directory
2. Optional: custom session title
3. Analysis progress with real-time stats
4. Upload to Gist or save locally

### Setup Wizard

```bash
ccblog --setup
```

**Perfect for Claude Code to help users!** The wizard:
- Checks all prerequisites (Node.js, API key, GitHub CLI)
- Guides through API key setup with clear instructions
- Tests the connection to make sure everything works
- Provides helpful error messages if something's wrong
- Can save API key to `.env` automatically

**Example conversation:**
```
User: "Help me set up the blog generator"
Claude: "Let's run the setup wizard! Please run: ccblog --setup"
User: [runs ccblog --setup]
Claude: "Great! The wizard will guide you through each step.
         When it asks for your API key, get one from
         https://platform.openai.com/api-keys"
```

### Programmatic Usage

```typescript
import { analyzeSession } from 'claude-code-blog-generator';
import { OpenAIClient } from 'claude-code-blog-generator/ai';

const client = new OpenAIClient();
const result = await analyzeSession(client, {
  sessionPath: '/path/to/session.jsonl',
  contextWindow: 3
});

console.log(`Detected ${result.phases.phases.length} phases`);
```

## Requirements

- **Node.js** 18+ or Bun
- **OpenAI API key** - gpt-5-nano model (released August 2025)
- **GitHub CLI** (optional, for Gist upload) - `brew install gh` or https://cli.github.com/

## Cost

Uses **gpt-5-nano** exclusively:
- **Pricing**: $0.05/1M input tokens, $0.40/1M output tokens
- **Typical session** (200 messages): ~$0.001
- **Well under target** of $0.01 per session

Example breakdown:
- Meta-analysis: ~4k tokens = $0.0003
- Phase classification: ~500 tokens per window = $0.00003
- **Total for 150-message session**: ~$0.001

## How It Works

### Two-Pass AI Analysis

**Pass 1: Phase Detection**
- Analyzes user messages to identify task boundaries
- Generates specific, action-oriented phase names
- Example: "Implementing deep links (page-XXX.html#msg-N) from summary to specific viewer messages"

**Pass 2: Contextual Annotations**
- Annotates each message with color coding:
  - 🟢 **Green**: New task start
  - 🟡 **Yellow**: Clarification or steering
  - 🔴 **Red**: Pivot or major change
- Extracts reasoning and key quotes

### Smart Summarization

The blog summary generator:
- **Synthesizes goal** from first phase + user intent (doesn't just copy first message)
- **Groups content by phase** for narrative flow
- **Extracts key prompts** with annotations
- **Pulls code snippets** from tool_use/tool_result blocks
- **Generates ASCII diagrams** for session flow visualization
- **Creates deep links** to specific messages in paginated viewer

## Examples

### Generated Gist

See a live example: [Sample Session Analysis](https://gist.github.com/varadhjain/403f012649b153984ff46284e8cfc430)

Preview the annotated viewer: [GistPreview Link](https://gistpreview.github.io/?403f012649b153984ff46284e8cfc430/index.html)

### Sample Output

```
🚀 Analyzing current session...

1. Parsing session file...
✅ Parsed 625 messages

2. Analyzing session with AI...
⏳ Pass 1: Detecting phases...
✓ Identified 10 distinct phases

⏳ Pass 2: Annotating messages...
✓ All 12 user messages annotated

✅ Analysis complete!
   🟢 3 new tasks
   🟡 9 clarifications
   🔴 0 pivots
   📋 10 phases detected

3. Generating blog summary...
✅ Blog summary generated!

4. Uploading to Gist...
✅ Success!

🔗 Gist URL: https://gist.github.com/...
👁️  Preview: https://gistpreview.github.io/...
```

## Security & Privacy

### API Key Safety

✅ **Your API keys are safe:**
- Keys are read from `.env` file or environment variables (NEVER hardcoded)
- `.env` is in `.gitignore` - will never be committed to git
- CLI never logs or displays your API key
- Generated Gists DO NOT contain API keys

⚠️ **Important:**
- Never commit your `.env` file
- Never share your `.env` file or API keys
- If you accidentally expose a key, regenerate it immediately at https://platform.openai.com/api-keys

### Session Privacy

⚠️ **Claude session files may contain sensitive information:**
- Private code, API keys, credentials, personal data
- `.jsonl` files are gitignored by default
- When uploading to Gist, review the output first
- Consider using private Gists for sensitive sessions

**To create private Gist:**
Edit `src/gist-uploader.ts` and change:
```typescript
const createCmd = `gh gist create --public ...`;
// to:
const createCmd = `gh gist create ...`; // Private by default
```

### What Gets Shared

When you upload to Gist, these files are shared:
- ✅ `SUMMARY.md` - Blog summary (safe, high-level)
- ✅ `summary.html` - Formatted summary (safe)
- ⚠️ `index.html` + `page-*.html` - Full conversation (may contain sensitive info)

**Recommendation:** Review generated files before uploading. Use `Save locally` option if session contains sensitive data.

## Troubleshooting

### "No sessions found"
Make sure you've run Claude Code at least once. Sessions are stored in `~/.claude/projects/`

### "OPENAI_API_KEY not found"
Create a `.env` file with:
```
OPENAI_API_KEY=sk-proj-...
```

### "No content in response from OpenAI API"
This happens when gpt-5-nano reasoning model exhausts tokens. The CLI now uses 8000 tokens (plenty of room).

### Gist upload fails
Install GitHub CLI and authenticate:
```bash
brew install gh
gh auth login
```
Make sure you grant the `gist` scope when authenticating.

## Development

### Setup

```bash
git clone https://github.com/varadhjain/claude-code-blog-generator.git
cd claude-code-blog-generator
npm install
echo "OPENAI_API_KEY=sk-proj-..." > .env
```

### Build

```bash
npm run build
```

### Run locally

```bash
npm link
ccblog
```

### Project Structure

```
src/
├── cli/                     # Interactive TUI CLI
│   └── index.ts
├── user-annotations.ts      # Two-pass AI analysis
├── blog-summary/            # Blog post generation
│   ├── generator.ts         # Main orchestrator
│   ├── extractor.ts         # Extract goal, outcome, prompts
│   ├── formatter.ts         # Text/code formatting
│   ├── diagram-builder.ts   # ASCII diagrams
│   └── templates/           # Handlebars templates
│       ├── summary.md.hbs
│       └── summary.html.hbs
├── annotated-viewer/        # HTML viewer generation
│   ├── generator.ts
│   └── templates/
└── gist-uploader.ts         # GitHub Gist integration
```

## Contributing

Issues and PRs welcome! https://github.com/varadhjain/claude-code-blog-generator/issues

## License

MIT

---

**Built with ❤️ for teams documenting their Claude Code sessions**

*Powered by gpt-5-nano for ultra-low-cost, high-quality session analysis*
