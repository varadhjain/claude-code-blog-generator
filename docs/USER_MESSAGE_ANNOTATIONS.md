# User Message Annotation Tool

AI-powered analysis of user messages in Claude Code sessions with contextual insights.

## Quick Start

```bash
npm run annotate
```

This launches an interactive TUI where you can:
1. Browse directories
2. Select a `.jsonl` session file
3. Optionally save annotations to JSON
4. View detailed analysis with color-coded messages
5. **Upload annotations to GitHub Gist** for easy sharing

## What It Does

Analyzes user messages and annotates each with:
- **One-line explanation** of what the user is doing
- **Color code** indicating session flow:
  - 🟢 **Green**: Starting new task/phase
  - 🟡 **Yellow**: Steering/correcting ongoing work
  - 🔴 **Red**: Major issue or restart
- **Reasoning** explaining why that color was chosen

## Example Output

```
🟢 Message #0
   "Okay, so what Wilhelm and I..."
   → Starting collaborative blog project setup
   Reasoning: User introduces a new collaborative project phase

🟡 Message #4
   "okay almost there. https://mitchellh.com/writing/..."
   → Continuing work and suggesting UX patterns
   Reasoning: Providing additional insights related to ongoing discussions

🟢 Message #7
   "great. commit the latest and go"
   → Finalizing changes and proceeding
   Reasoning: Signaling end of current tasks and moving to next steps
```

## How It Works (Option C: Two-Pass Contextual)

**Pass 1: Phase Detection**
- Identifies task boundaries across all user messages
- Groups messages into semantic phases
- Detects where new work begins

**Pass 2: Contextual Annotation**
- Annotates each message individually
- Uses adaptive context window (3 prior messages)
- Considers phase boundaries when assigning colors
- Provides reasoning for each decision

## Cost

Approximately **$0.0017 per session** with gpt-4o-mini
- 1 API call for phase detection
- N API calls for individual annotations (one per user message)

Example: 6 user messages = 7 total API calls ≈ $0.0017

## CLI Usage

```bash
# Interactive TUI (recommended)
npm run annotate

# Direct file annotation
npx ts-node scripts/annotate-tui.ts

# Compare Option A (single-pass) vs Option C (two-pass)
npx ts-node scripts/compare-annotation-approaches.ts examples/session.jsonl

# Simple annotation (Option A - cheaper)
npx ts-node scripts/annotate-user-messages.ts examples/session.jsonl [output.json]
```

## Output Files

Annotations are saved as JSON:

```json
{
  "phases": [...],
  "annotations": [
    {
      "messageIndex": 0,
      "content": "User's message text...",
      "annotation": "Short explanation",
      "color": "green",
      "reasoning": "Why this color was chosen"
    }
  ]
}
```

## GitHub Gist Upload

After analysis completes, you can optionally upload the results to a **public GitHub Gist** for easy sharing.

**Requirements:**
- Install `gh` CLI: https://cli.github.com/
- Authenticate: `gh auth login`

**What gets uploaded:**
- Session name
- Detected phases
- All message annotations with reasoning
- Statistics

## Use Cases

1. **Session Review**: Understand user's approach and decision points
2. **Pattern Mining**: Identify common workflows across sessions
3. **Blog Generation**: Use annotations as sidebar/TOC for blog posts
4. **Learning**: Extract "what we can learn" from successful sessions
5. **Debugging**: Track where user had to correct or restart
6. **Sharing**: Upload to Gist and share the URL with teammates

## Future: AmpCode-style Hosting

See [VISION.md](VISION.md) for the roadmap toward interactive session publishing.
