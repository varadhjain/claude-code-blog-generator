# Vision: Session Publishing Platform

## Evolution

**Current**: JSONL → Blog Post (static, one-way)
**Future**: JSONL → Interactive Session Viewer (dynamic, explorable)

## Core Features

### 1. PII Redaction
- File paths → generic placeholders
- Usernames → anonymized
- API keys, tokens → redacted
- Project-specific names → configurable masking

### 2. Interactive Viewer (AmpCode-style)
- Collapsible message tree
- Syntax-highlighted code
- File diffs (before/after)
- Tool call visualizations
- Timeline view

### 3. AI-Powered Insights (multiple modes)
- **Interesting Moments** - key decisions, pivots, breakthroughs
- **What We Can Learn** - patterns, anti-patterns, best practices
- **Session Summary** - TL;DR with takeaways
- **Code Quality Analysis** - what worked, what didn't
- **Debugging Journey** - problem-solving flow

### 4. Multiple Output Formats
- Blog post (existing)
- Interactive web viewer
- Shareable link (hosted)
- Embedded widget
- PDF export

## Architecture

```
JSONL Session
    ↓
PII Redaction Layer
    ↓
Session Digest (structured data)
    ↓
    ├─→ Blog Post Generator (existing)
    ├─→ Interactive Viewer (HTML/JS)
    ├─→ Insights Analyzer (AI commentary)
    └─→ Publishing Service (hosting)
```

## Processing Modes (all using gpt-5-nano)

1. **Narrative** - blog posts (existing)
2. **Insights** - interesting things you can learn
3. **Code Review** - technical analysis
4. **Pattern Mining** - extract reusable patterns
5. **Session Archaeology** - investigative analysis

## Goal

Turn every Claude Code session into shareable, explorable learning material.
