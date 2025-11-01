# Claude Code Blog Post Generator

Transform your Claude Code sessions into engaging, educational blog posts and interactive threads.

## 🎯 What is This?

Claude Code Blog Post Generator automatically converts your AI-assisted programming sessions into shareable, narrative-driven content that helps others **learn from your experience**.

Instead of sharing raw chat logs, you get:
- **📖 Mitchell-style blog posts** with clear problem → solution narrative structure
- **🧵 Interactive threads** with semantic phase grouping and smart navigation
- **🔒 Automatic PII redaction** that preserves educational value
- **🎓 Learning callouts** highlighting key decisions, bugs, and breakthroughs

## 🚀 Quick Start

```bash
# Install globally
npm install -g claude-code-blog-generator

# Generate a blog post from your latest session
blog-post-generator generate $(blog-post-generator list --current)

# Generate an interactive thread
blog-post-generator generate <session-id> --mode=interactive --export-html
```

## ✨ Features

### Intelligent Narrative Chunking

Unlike chronological message dumps, we create **semantic phases**:

```
📍 Setup Phase (Messages 1-3)
💭 Exploration (Messages 4-15)
  ├─ Iteration 1: First approach
  ├─ ⚡ Decision: Pivot to TypeScript
  └─ Iteration 2: Refined approach
💻 Implementation (Messages 16-25)
🐛 Bug Fix: Type errors (Messages 26-32)
✅ Resolved
```

This creates **learning narratives**, not chat logs.

### Two Generation Modes

**1. Auto Blog Mode** (Mitchell Hashimoto-inspired)
- Coherent narrative structure (Problem → Exploration → Solution → Lessons)
- Contextual code snippets with explanations
- Decision points and pivots highlighted
- Failed attempts shown as learning opportunities
- Conversational, educational tone

**2. Interactive Thread Mode** (Enhanced AmpCode-style)
- Message-by-message view with phase labels
- Smart minimap for navigation
- Persistent context bar showing current objective
- Jump links between related messages
- Collapsible tool executions

### Smart PII Redaction

Powered by GPT-5-nano, intelligently redacts:
- File paths → `<project>/src/components/Button.tsx` (structure preserved)
- Usernames → `<user>`
- Emails → `<email>`
- API keys → `<api-key>`

Preserves code readability and educational context while protecting privacy.

### Cost-Effective

Uses GPT-5-nano ($0.05/M input, $0.40/M output tokens):
- **~$0.024 per session** (less than 3 cents!)
- Fast processing (<30 seconds for typical sessions)
- High-quality phase detection and redaction

## 📦 Installation

```bash
# Global installation (recommended)
npm install -g claude-code-blog-generator

# Or use directly with npx
npx claude-code-blog-generator generate <session-id>
```

## 📖 Usage

### Generate Blog Post

```bash
# Auto mode (default) - Mitchell-style narrative
blog-post-generator generate abc-123-def-456

# With custom output path
blog-post-generator generate abc-123 --output ./my-blog-post.md

# With metadata (token usage, duration, model info)
blog-post-generator generate abc-123 --include-metadata
```

### Generate Interactive Thread

```bash
# Interactive mode with HTML output
blog-post-generator generate abc-123 --mode=interactive --export-html

# Opens a shareable HTML file with minimap navigation
```

### List Available Sessions

```bash
# List all sessions for current project
blog-post-generator list

# Get current/latest session ID
blog-post-generator list --current
```

### Advanced Options

```bash
blog-post-generator generate <session-id> [options]

Options:
  --mode <type>           auto | interactive (default: auto)
  --output <file>         Output file path (default: ./blog-post.md)
  --template <type>       blog | thread | tutorial | postmortem
  --redact-level <level>  aggressive | balanced | minimal (default: balanced)
  --include-metadata      Include token usage, duration, model info
  --export-html           Generate interactive HTML (for interactive mode)
  --interactive-pii       Review PII redactions before generating
  --project <path>        Project path (auto-detected from cwd)
```

## 🎯 Use Cases

### Teaching & Learning
- Share your problem-solving process with junior developers
- Create tutorials from real coding sessions
- Document complex debugging journeys
- Build a knowledge base of solved problems

### Technical Writing
- Generate first drafts of technical blog posts
- Create case studies from actual work
- Document feature development journeys
- Write postmortems with actual session data

### Team Knowledge Sharing
- Share solutions to common problems
- Document architectural decisions
- Create onboarding materials from real work
- Build internal best practices guides

## 🏗️ How It Works

1. **Parse**: Reads Claude Code session files from `~/.claude/projects/`
2. **Analyze**: Uses GPT-5-nano to detect semantic phases (Setup, Coding, Debugging, etc.)
3. **Track**: Maintains context across the session (objectives, decisions, approaches)
4. **Redact**: Intelligently removes PII while preserving educational value
5. **Generate**: Creates narrative-driven content in your chosen format

See [PLAN.md](./PLAN.md) for detailed architecture and implementation strategy.

## 🔧 Configuration

Create `.blog-post-generator.json` in your project root:

```json
{
  "defaultMode": "auto",
  "defaultTemplate": "blog",
  "redactLevel": "balanced",
  "includeMetadata": true,
  "outputPath": "./blog-posts",
  "openaiApiKey": "sk-..."
}
```

Or set environment variables:

```bash
export OPENAI_API_KEY="sk-..."
export BLOG_GENERATOR_REDACT_LEVEL="balanced"
```

## 📚 Examples

See the [examples/](./examples/) directory for:
- `example-auto-blog.md` - Auto-generated Mitchell-style blog post
- `example-thread.html` - Interactive thread with minimap
- `sample-session.jsonl` - Sample Claude Code session file

## 🛠️ Development

```bash
# Clone the repository
git clone https://github.com/[username]/claude-code-blog-generator.git
cd claude-code-blog-generator

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Run locally
npm link
blog-post-generator --help
```

See [PLAN.md](./PLAN.md) for complete implementation plan and architecture.

## 🤝 Contributing

We welcome contributions! Areas we'd love help with:
- Additional templates (tutorial, postmortem, case study)
- Improved phase detection prompts
- Better PII redaction strategies
- UI/UX improvements for interactive mode
- Documentation and examples

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📋 Roadmap

- [ ] **v1.0**: Core functionality (auto blog + interactive thread)
- [ ] **v1.1**: Multi-session blog posts (combine related sessions)
- [ ] **v1.2**: Custom template plugin system
- [ ] **v1.3**: Web UI for non-technical users
- [ ] **v2.0**: Real-time collaboration features

## 🙏 Inspiration

This project draws inspiration from:
- [Mitchell Hashimoto's "Non-Trivial Vibing"](https://mitchellh.com/writing/non-trivial-vibing) - Gold standard for narrative technical writing
- [AmpCode Threads](https://ampcode.com/news/read-threads) - Excellent minimap navigation and message grouping
- Claude Code - The amazing tool that makes AI-assisted programming accessible

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details

## 👥 Authors

Built by [Your Name] and Wilhelm during a co-working session.

Made with ❤️ and Claude Code.

---

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/[username]/claude-code-blog-generator/issues)
- **Discussions**: [GitHub Discussions](https://github.com/[username]/claude-code-blog-generator/discussions)
- **Documentation**: [Full docs](./docs/)

---

**Star ⭐ this repo if you find it useful!**
