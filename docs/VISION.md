# Vision: AmpCode-Style Session Viewer

**Current:** JSONL → Annotations/Blog
**Future:** JSONL → Interactive Web Viewer

## Core Features

1. **PII Redaction** - Strip file paths, API keys, usernames
2. **Interactive Viewer** - Collapsible messages, syntax highlighting, diffs
3. **AI Insights** - Interesting moments, patterns, learnings
4. **Multiple Formats** - Web, blog, PDF, embeds
5. **Hosting** - Shareable links, public/private

## Architecture

```
JSONL → Redact → Analyze → View → Host
```

## AI Modes

1. User annotations (done)
2. AI insights (interesting moments)
3. Code review
4. Pattern mining

## Goal

Shareable, explorable sessions like AmpCode threads.
