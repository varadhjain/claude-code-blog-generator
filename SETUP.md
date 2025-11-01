# Setup Guide

## Quick Start

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Set up your OpenAI API key**

   Create a `.env` file in the project root:
   ```bash
   OPENAI_API_KEY=sk-proj-your-key-here
   ```

   **⚠️ IMPORTANT**: The `.env` file is in `.gitignore` and will NOT be pushed to GitHub.

3. **Run on your session**
   ```bash
   # Place your session JSONL file in a local directory (not tracked by git)
   mkdir -p sample-sessions
   cp ~/.claude/projects/your-project/session-id.jsonl sample-sessions/

   # Generate sidebar
   npm run workflow sample-sessions/session-id.jsonl
   ```

   The generated sidebar will:
   - Be saved to `output/sidebar-[timestamp].md`
   - Auto-open in your default markdown viewer
   - **NOT** be committed to git (output/ is in .gitignore)

## What Gets Generated

The sidebar includes:
- **Session Goal**: What you set out to do
- **Approach**: How you approached the problem (strategy, workflow, key decisions)
- **Problems Encountered**: ALL problems with symptom → attempts → resolution
- **What Went Well**: Explicit success tracking (velocity, elegance, efficiency)
- **Learnings**: Evidence-backed insights you can apply to future work
- **Interesting Moments**: 3 most notable things that happened
- **Potential Titles**: 8-10 blog post title options
- **Key Phases**: Session phases with transitions

## Citations for Comments

The generated sidebar includes **message references** throughout:
- Problems: `message_range: [45, 67]`
- Successes: `message_range: [10, 50]`
- Learnings: `supporting_evidence.message_indices: [12, 45, 67]`
- Decisions: `when_message: 138`

These can be used to create "comments" on a hosted version of the chat, linking narrative insights back to specific messages.

## Cost

Using gpt-5-nano for cost efficiency:
- ~$0.002 per session (6 API calls)
- Input: $0.05/1M tokens
- Output: $0.40/1M tokens

## Files NOT in Git

These are in `.gitignore` and safe to use locally:
- `.env` - Your API key
- `sample-sessions/` - Your local session files
- `output/` - Generated sidebar markdown files
- `*.jsonl` - Any JSONL files

## Customization

Edit prompts in `src/prompts/` to adjust what gets extracted:
- `problem-extraction.ts` - What counts as a problem
- `success-extraction.ts` - What counts as success
- `structured-learning.ts` - How learnings are categorized
- `approach-narrative.ts` - How approach is synthesized
- `interesting-moments.ts` - What makes something "interesting"
- `title-brainstorm.ts` - Title generation styles

## Development

```bash
# Run tests
npm test

# Lint
npm run lint

# Build
npm run build
```
