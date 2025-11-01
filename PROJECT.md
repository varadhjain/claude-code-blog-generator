# Claude Code Blog Post Generator

## The Problem
Claude Code sessions are hard to share and learn from. Raw logs are messy. We need automatic conversion to educational blog posts.

## The Solution
Parse `~/.claude/projects/[session].jsonl` → Detect phases (Setup, Coding, Debugging) → Generate narrative blog post

## Core Idea: Semantic Chunking
Instead of: "Message 1, Message 2, Message 3..."
We create: "Setup Phase (msg 1-3) → Coding (msg 4-10) → Bug Fix (msg 11-15)"

## Input
```
~/.claude/projects/-Users-...-myproject/abc-123-def.jsonl
```
JSONL file with one message per line. Each message has:
- `uuid`, `parentUuid` (conversation tree)
- `type`: "user" | "assistant"
- `message.content`: text or tool usage (Read, Write, Bash, etc.)
- `timestamp`, `cwd`, `gitBranch`

## Output Modes

### 1. Auto Blog (Mitchell-style)
```markdown
# Implementing Dark Mode Toggle

## The Problem
[Hook from user's first message]

## Setup (Messages 1-3)
[Narrative: what files were explored]

## Coding (Messages 4-15)
[Implementation with code snippets]

## Bug: TypeScript Errors (Messages 16-20)
**What went wrong**: [error]
**Fix**: [solution]

## Lessons Learned
[Key takeaways]
```

### 2. Interactive Thread
HTML with sidebar navigation:
```
📍 Session Map
├─ 🔧 Setup (1-3)
├─ 💻 Coding (4-15)
└─ 🐛 Bug Fix (16-20)
```

## Key Tech
- **GPT-5-nano**: Phase detection ($0.024/session)
- **TypeScript**: Type safety
- **~/.claude/projects**: Session storage location

## References
- Mitchell's blog: https://mitchellh.com/writing/non-trivial-vibing
- AmpCode Threads: https://ampcode.com/news/read-threads
