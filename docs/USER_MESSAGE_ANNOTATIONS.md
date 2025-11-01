# User Message Annotations

AI-powered analysis of Claude Code sessions.

## Quick Start

```bash
npm run annotate
```

**What it does:**
1. Browse for `.jsonl` session file
2. Analyze with two-pass contextual AI
3. Get color-coded messages (🟢🟡🔴) with reasoning
4. Upload to GitHub Gist (optional)

## Output Example

```
🟢 Message #0
   "Let's build a blog generator..."
   → Starting new project
   Reasoning: User introduces new collaborative project

🟡 Message #4
   "Actually use gpt-4o-mini instead"
   → Correcting model choice
   Reasoning: Minor adjustment within same task
```

## How It Works

**Pass 1:** Phase detection (identifies task boundaries)
**Pass 2:** Contextual annotation (3-message window, color + reasoning)

**Cost:** ~$0.0017 per session (gpt-4o-mini)

## Gist Upload

**Requirements:** `gh` CLI (https://cli.github.com/)

Uploads human-readable Markdown with:
- Session summary
- Detected phases
- Annotated messages with reasoning

## Use Cases

- Session review
- Pattern mining
- Sharing with teammates
- Blog generation sidebar
