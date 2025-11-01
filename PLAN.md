# Claude Code Blog Post Generator - Implementation Plan

## Project Mission

Transform Claude Code session logs into engaging, educational narratives that help people **learn from and teach** effective AI-assisted programming patterns.

### The Problem We're Solving

Current solutions for sharing Claude Code sessions fall short:
- **Raw session logs**: Chronological, overwhelming, hard to learn from
- **AmpCode Threads**: Message-by-message view lacks narrative chunking (no "messages 1-3 = setup, 4-10 = exploration")
- **Manual blog posts**: Time-consuming, require significant human effort

### Our Solution

Automated blog post generation with **intelligent narrative chunking** that:
1. Detects semantic phases (Setup → Thinking → Coding → Debugging)
2. Maintains persistent context across message groups
3. Highlights decision points and learning moments
4. Generates educational content in two modes: auto blog or interactive thread

---

## Inspiration & Design Principles

### Mitchell Hashimoto's "Non-Trivial Vibing" Post
**What makes it great:**
- Concrete problem hook (not abstract)
- Explicit phase structure (Pre-work → Exploration → Integration)
- Shows failed attempts as learning opportunities
- Conversational, self-aware tone
- Technical details stay contextual, not exhaustive
- Human expertise foregrounded alongside AI

### AmpCode Threads
**What works:**
- Message-by-message minimap with jump links
- Natural chunking by user questions
- Minimal metadata overhead

**What's missing (our opportunity):**
- No semantic phase grouping ("Setup", "Debugging", etc.)
- Context collapses after message 20+
- No persistent "current objective" reference
- Missing decision point highlighting
- No narrative cohesion or learning callouts

### Our Design Philosophy

```
Chronological messages + Semantic analysis = Educational narrative
```

We don't just replay the session—we **tell the story of problem-solving**.

---

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                     CLI Interface                           │
│  blog-post-generator generate <session-id> [options]       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Session Parser                            │
│  Reads ~/.claude/projects/[project]/[session-id].jsonl     │
│  Reconstructs conversation using parentUuid references      │
│  Extracts: messages, tool calls, results, metadata         │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Phase Detector (GPT-5-nano)                    │
│  Analyzes message clusters to detect semantic phases:      │
│  • Setup/Exploration  • Planning  • Thinking                │
│  • Coding  • Testing  • Debugging  • Refinement            │
│  • Decision Points (pivots, breakthroughs)                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Context Tracker                            │
│  Maintains persistent state across phases:                 │
│  • Current objective  • Active files                        │
│  • Approach taken  • Key decisions                          │
│  Updates on each phase transition                           │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              PII Redactor (GPT-5-nano)                      │
│  Intelligently redacts while preserving education:         │
│  • File paths → <project>/src/components/Button.tsx        │
│  • User names → <user>  • Emails → <email>                 │
│  • API keys → <api-key>                                     │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│              Narrative Generator                            │
│  Mode 1: Auto Blog (Mitchell-style narrative)              │
│  Mode 2: Interactive Thread (AmpCode + improvements)       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Output Renderer                            │
│  Formats: Markdown, HTML with minimap, JSON                │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase Detection Strategy

### Phase Types & Detection Patterns

| Phase | Tool Patterns | Message Characteristics | Transition Signals |
|-------|---------------|-------------------------|-------------------|
| **Setup** | Read, Glob, Grep clusters | Exploring codebase, understanding context | First Write/Edit operation |
| **Planning** | TodoWrite, AskUserQuestion | Discussion of approach, design decisions | TodoWrite marks tasks as in_progress |
| **Thinking** | Extended thinking blocks | Analysis, problem decomposition | Tool execution begins |
| **Coding** | Write, Edit operations | Implementation, file modifications | Bash test/build commands |
| **Testing** | Bash (test/build/run) | Validation, checking output | Error messages in results |
| **Debugging** | Error output + Read/Edit | Fixing issues, iteration | Success messages or new phase |
| **Refinement** | Edit + small changes | Polish, optimization | User satisfaction or new task |
| **Decision Point** | Question change, pivot | Approach shift, major decision | New phase with different direction |

### Detection Algorithm

```typescript
function detectPhases(messages: Message[]): Phase[] {
  const phases: Phase[] = [];

  // Analyze in sliding windows of 3-5 messages
  for (let i = 0; i < messages.length; i += windowSize) {
    const window = messages.slice(i, i + windowSize);

    // Extract tool usage patterns
    const toolPattern = analyzeToolUsage(window);

    // Use GPT-5-nano to classify phase
    const phase = await gpt5nano.classify({
      messages: window,
      toolPattern,
      previousPhase: phases[phases.length - 1],
      context: "Claude Code session analysis"
    });

    phases.push(phase);
  }

  // Merge consecutive same-phase windows
  return mergePhases(phases);
}
```

### GPT-5-nano Prompt Strategy

```
Analyze these Claude Code messages and tool usage patterns.

Context:
- Previous phase: {previousPhase}
- Tool pattern: {toolPattern}
- Message content: {messages}

Classify the current phase as one of:
- setup: Exploring codebase, understanding context
- planning: Discussing approach, making decisions
- thinking: Analysis, problem decomposition
- coding: Writing/editing implementation
- testing: Running tests, validation
- debugging: Fixing errors, iteration
- refinement: Polish and optimization
- decision_point: Major pivot or approach change

Also identify:
- Is this a transition to a new phase?
- What is the current objective?
- What key decision (if any) was made?

Return JSON: {phase, isTransition, objective, decision}
```

---

## Context Tracking

### Context State Object

```typescript
interface SessionContext {
  currentObjective: string;      // "Implement dark mode toggle"
  activeFiles: string[];          // ["src/App.tsx", "src/theme.ts"]
  approachTaken: string;          // "Using React Context for theme state"
  keyDecisions: Decision[];       // [{message: 15, decision: "Switched to CSS-in-JS"}]
  openQuestions: string[];        // ["How to persist theme preference?"]
}
```

### Update Strategy

Context updates on:
1. **Phase transitions** - Re-analyze objective
2. **File operations** - Track Write/Edit targets
3. **User guidance** - Capture approach decisions
4. **Decision points** - Record pivots and reasoning

### Persistent Display

In interactive mode, show context bar:

```
┌─ Current Context ────────────────────────────────────────┐
│ Objective: Implement user authentication system         │
│ Approach: JWT tokens with refresh logic                 │
│ Active Files: src/auth/jwt.ts, src/middleware/auth.ts  │
│ Last Decision (msg 23): Switched from sessions to JWT   │
└──────────────────────────────────────────────────────────┘
```

---

## Narrative Generation

### Mode 1: Auto Blog (Mitchell-Style)

**Structure:**

```markdown
# [Auto-generated title from session goal]

> Session Duration: 45 minutes | Messages: 32 | Model: Claude Sonnet 4.5
> Date: November 1, 2025

## The Problem

[Hook extracted from initial user message - concrete, relatable]

## Setup Phase (Messages 1-3)

[Narrative summary: What context was gathered, what files were explored]

Key files identified:
- `src/components/Dashboard.tsx` - Main dashboard component
- `src/api/metrics.ts` - Metrics data fetching

## Exploration Phase (Messages 4-15)

### Initial Approach: REST API polling

[What was tried]

```typescript
// Initial implementation
setInterval(() => fetchMetrics(), 5000);
```

[What happened, what we learned]

### 💡 Decision Point (Message 12): Switch to WebSockets

**Why we pivoted:** Polling created unnecessary server load and delayed updates.

**New approach:** Real-time WebSocket connection for live metrics.

### Iteration 2: WebSocket Implementation

[Refined approach, code snippets, outcomes]

## Implementation Phase (Messages 16-25)

[Main coding narrative with key snippets contextually placed]

## Debugging Phase (Messages 26-32)

### 🐛 Bug: Connection drops on network change

**Error encountered:**
```
WebSocket connection failed: Network unreachable
```

**Root cause:** No reconnection logic for network interruptions.

**Solution:** Implemented exponential backoff reconnection strategy.

**What we learned:** Always handle connection resilience in real-time features.

## Lessons Learned

1. **Pattern:** Polling is simple but WebSockets scale better for real-time data
2. **Gotcha:** Always implement reconnection logic for WebSocket clients
3. **Tool usage:** Claude Code's ability to search across files helped identify existing WebSocket patterns
```

### Mode 2: Interactive Thread (Enhanced AmpCode)

**Features:**

1. **Phase-based minimap** (side navigation)
```
📍 Session Map
├─ 🔧 Setup (Messages 1-3)
├─ 💭 Exploration (Messages 4-15)
│   ├─ Iteration 1: REST polling
│   ├─ ⚡ Decision: Switch to WebSockets (msg 12)
│   └─ Iteration 2: WebSocket impl
├─ 💻 Implementation (Messages 16-25)
├─ 🐛 Debugging: Connection drops (Messages 26-32)
└─ ✅ Resolved (Message 32)
```

2. **Message view with phase labels**
```
───────────────────────────────────────────
🔧 SETUP PHASE

Message 1 • 2:34 PM • User
Can you help me add real-time metrics to the dashboard?

Message 2 • 2:35 PM • Claude
[Uses Glob tool to find dashboard files...]

Message 3 • 2:36 PM • Claude
I found the Dashboard component. Let me read it to understand
the current implementation...

───────────────────────────────────────────
💭 EXPLORATION PHASE

Message 4 • 2:38 PM • Claude
...
```

3. **Persistent context bar** (shown at top)
4. **Jump links** for related messages
5. **Collapsible tool executions** (expand to see details)

---

## PII Redaction Strategy

### GPT-5-nano Redaction Prompt

```
Redact personally identifiable information from this Claude Code session while preserving educational value.

Message content:
{message}

Redaction rules:
1. File paths: Keep project structure visible
   - /Users/john/projects/myapp/src/App.tsx → <project>/src/App.tsx

2. Usernames: Replace with generic placeholder
   - john.doe → <user>

3. Emails: Redact completely
   - john@company.com → <email>

4. API keys/tokens: Always redact
   - sk_live_abc123... → <api-key>

5. Company/project names in paths: Keep if generic, redact if specific
   - mycompany-internal → <company>
   - my-todo-app → keep (generic)

6. Code content: Keep intact unless it contains secrets

Return the redacted message preserving all formatting and code blocks.
```

### Redaction Levels

- **Aggressive**: Redact all paths, names, anything potentially sensitive
- **Balanced** (default): Smart redaction preserving educational context
- **Minimal**: Only obvious secrets (API keys, emails, tokens)

---

## CLI Design

### Commands

```bash
# Generate blog post (auto mode)
blog-post-generator generate <session-id>

# Generate interactive thread
blog-post-generator generate <session-id> --mode=interactive

# List available sessions for current project
blog-post-generator list

# Preview without writing file
blog-post-generator generate <session-id> --preview
```

### Options

```
--mode <type>           auto | interactive (default: auto)
--output <file>         Output file path (default: ./blog-post.md)
--template <type>       blog | thread | tutorial | postmortem
--redact-level <level>  aggressive | balanced | minimal (default: balanced)
--include-metadata      Include token usage, duration, model info
--export-html           Generate interactive HTML (for interactive mode)
--interactive-pii       Review PII redactions before generating
--project <path>        Project path (auto-detected from cwd)
```

### Examples

```bash
# Quick blog post from current session
blog-post-generator generate $(blog-post-generator list --current)

# Interactive thread with HTML output
blog-post-generator generate abc-123 --mode=interactive --export-html

# Tutorial-style with PII review
blog-post-generator generate abc-123 --template=tutorial --interactive-pii
```

---

## Technical Stack

### Core Technologies

- **Language**: TypeScript 5.x
- **Runtime**: Node.js 20+
- **AI Model**: GPT-5-nano via OpenAI SDK
  - Pricing: $0.05/M input tokens, $0.40/M output tokens
  - 272K input context, 128K output limit
  - Knowledge cutoff: May 2024
- **CLI Framework**: yargs (robust argument parsing)
- **Testing**: Jest with TypeScript support
- **Build**: esbuild (fast bundling) + tsc (type checking)
- **Distribution**: npm package

### Project Structure

```
blog-post-generator/
├── src/
│   ├── cli/
│   │   ├── index.ts              # CLI entry point
│   │   ├── commands/
│   │   │   ├── generate.ts       # Generate command
│   │   │   └── list.ts           # List sessions command
│   │   └── options.ts            # Shared CLI options
│   ├── parser/
│   │   ├── session-parser.ts     # JSONL parsing
│   │   ├── message-reconstructor.ts  # parentUuid reconstruction
│   │   └── types.ts              # Session data types
│   ├── analyzer/
│   │   ├── phase-detector.ts     # Phase detection with GPT-5-nano
│   │   ├── context-tracker.ts    # Context state management
│   │   ├── decision-extractor.ts # Decision point identification
│   │   └── tool-pattern-analyzer.ts  # Tool usage pattern analysis
│   ├── redactor/
│   │   ├── pii-redactor.ts       # GPT-5-nano PII redaction
│   │   └── redaction-rules.ts    # Redaction prompt templates
│   ├── generator/
│   │   ├── blog-generator.ts     # Auto blog mode (Mitchell-style)
│   │   ├── thread-generator.ts   # Interactive thread mode
│   │   ├── templates/
│   │   │   ├── blog.ts           # Blog post template
│   │   │   ├── thread.ts         # Thread template
│   │   │   └── tutorial.ts       # Tutorial template
│   │   └── renderers/
│   │       ├── markdown.ts       # Markdown output
│   │       ├── html.ts           # HTML with minimap
│   │       └── json.ts           # JSON export
│   ├── utils/
│   │   ├── openai-client.ts      # OpenAI SDK wrapper
│   │   ├── session-locator.ts    # Find sessions for project
│   │   └── file-helpers.ts       # File I/O utilities
│   └── types/
│       └── index.ts              # Shared TypeScript types
├── tests/
│   ├── parser/
│   ├── analyzer/
│   ├── generator/
│   └── fixtures/                 # Sample session files
├── examples/
│   ├── example-auto-blog.md      # Example auto-generated blog
│   ├── example-thread.html       # Example interactive thread
│   └── sample-session.jsonl      # Sample Claude Code session
├── docs/
│   ├── ARCHITECTURE.md           # Technical architecture
│   ├── TEMPLATES.md              # Template customization guide
│   └── PII-REDACTION.md          # PII strategy explanation
├── .github/
│   └── workflows/
│       ├── test.yml              # CI testing
│       └── publish.yml           # npm publish automation
├── package.json
├── tsconfig.json
├── jest.config.js
├── .gitignore
├── README.md
├── PLAN.md                       # This file
└── LICENSE
```

---

## Implementation Phases

### Phase 1: Foundation (Day 1 - Morning)

**Goal**: Core parsing and session reconstruction

- [ ] Initialize TypeScript/Node.js project
- [ ] Set up testing framework (Jest)
- [ ] Implement JSONL parser with streaming support
- [ ] Build message reconstruction logic (parentUuid handling)
- [ ] Create type definitions for session data
- [ ] Unit tests for parser

**Deliverable**: Can parse and reconstruct any Claude Code session

**Owner**: TBD (You or Wilhelm)

---

### Phase 2: Phase Detection (Day 1 - Afternoon)

**Goal**: Intelligent phase classification

- [ ] Integrate OpenAI SDK for GPT-5-nano
- [ ] Implement tool pattern analyzer
- [ ] Build phase detection with windowed analysis
- [ ] Create phase detection prompts
- [ ] Test on sample sessions
- [ ] Handle edge cases (very short sessions, subagents)

**Deliverable**: Can automatically detect semantic phases in sessions

**Owner**: TBD (You or Wilhelm)

---

### Phase 3: Context & Decisions (Day 1 - Evening)

**Goal**: Maintain context and identify key moments

- [ ] Build context tracking state machine
- [ ] Implement context update logic on phase transitions
- [ ] Create decision point extractor
- [ ] Identify learning moments (bugs, pivots, breakthroughs)
- [ ] Test context persistence across long sessions

**Deliverable**: Can track "current objective" and key decisions throughout session

**Owner**: TBD (You or Wilhelm)

---

### Phase 4: PII Redaction (Day 2 - Morning)

**Goal**: Safe, intelligent redaction

- [ ] Implement PII redaction with GPT-5-nano
- [ ] Create redaction prompt templates
- [ ] Support multiple redaction levels
- [ ] Interactive review mode for PII confirmation
- [ ] Handle code blocks specially (preserve structure)
- [ ] Test on real sessions with sensitive data

**Deliverable**: Can redact PII while preserving educational value

**Owner**: TBD (You or Wilhelm)

---

### Phase 5: Blog Generation (Day 2 - Afternoon)

**Goal**: Mitchell-style auto blog posts

- [ ] Implement blog post structure generator
- [ ] Create narrative weaving logic
- [ ] Build code snippet contextualization
- [ ] Add learning moment callouts
- [ ] Generate phase summaries
- [ ] Markdown rendering with frontmatter
- [ ] Test with various session types

**Deliverable**: Can generate engaging blog posts automatically

**Owner**: TBD (You or Wilhelm)

---

### Phase 6: Interactive Thread (Day 2 - Evening)

**Goal**: Enhanced AmpCode-style threads

- [ ] Build phase-based minimap/sidebar
- [ ] Create message-by-message view with phase labels
- [ ] Implement persistent context bar
- [ ] Add jump links between related messages
- [ ] Collapsible tool execution sections
- [ ] HTML rendering with CSS/JS interactivity
- [ ] Test navigation and UX

**Deliverable**: Interactive HTML threads with rich navigation

**Owner**: TBD (You or Wilhelm)

---

### Phase 7: CLI & Integration (Day 3 - Morning)

**Goal**: Polished command-line interface

- [ ] Build CLI with yargs
- [ ] Implement `generate` command
- [ ] Implement `list` command (find sessions)
- [ ] Add all command-line options
- [ ] Configuration file support (`.blog-post-generator.json`)
- [ ] Error handling and user feedback
- [ ] Progress indicators for long operations

**Deliverable**: Fully functional CLI tool

**Owner**: TBD (You or Wilhelm)

---

### Phase 8: Documentation & Examples (Day 3 - Afternoon)

**Goal**: GitHub-ready repository

- [ ] Write comprehensive README
- [ ] Create usage examples
- [ ] Generate example blog posts from real sessions
- [ ] Write architecture documentation
- [ ] Document template customization
- [ ] Explain PII redaction strategy
- [ ] Add contributing guidelines

**Deliverable**: Professional, documented open-source project

**Owner**: Both (split documentation work)

---

### Phase 9: Publishing (Day 3 - Evening)

**Goal**: Distribute to users

- [ ] Set up GitHub Actions for testing
- [ ] Configure npm publishing workflow
- [ ] Create npm package with proper metadata
- [ ] Test installation flow
- [ ] Publish v1.0.0 to npm
- [ ] Announce and share examples

**Deliverable**: Published npm package ready for users

**Owner**: Both (coordinate release)

---

## Success Criteria

### Technical Success

- ✅ Can parse any Claude Code session file (JSONL format)
- ✅ Detects phases with >80% accuracy on test sessions
- ✅ Maintains context across long sessions (50+ messages)
- ✅ Redacts PII without breaking code readability
- ✅ Generates readable blog posts in <30 seconds
- ✅ Interactive threads load and navigate smoothly
- ✅ CLI is intuitive and well-documented

### Educational Success

Readers of generated content can:
- ✅ Understand the problem being solved
- ✅ Follow the decision-making process
- ✅ Learn from failed attempts and pivots
- ✅ See the reasoning behind approach changes
- ✅ Reuse patterns in their own work
- ✅ Navigate easily without getting lost

### User Success

Tool users can:
- ✅ Generate blog posts in 1 command
- ✅ Share interactive threads via HTML
- ✅ Customize templates for their style
- ✅ Review PII before publishing
- ✅ Install globally via npm
- ✅ Understand all options via `--help`

---

## Open Questions

### For Discussion

1. **Session selection**: Should we support multi-session blog posts (combining related sessions)?
2. **Branding**: Include "Generated by Claude Code Blog Generator" footer?
3. **Analytics**: Track token usage and estimated cost per generation?
4. **Templates**: Should users be able to create custom templates via plugins?
5. **Hosting**: Offer hosted service for non-technical users, or CLI-only?
6. **Privacy**: Default to aggressive PII redaction, or ask user first?

---

## Timeline Summary

| Phase | Duration | Focus |
|-------|----------|-------|
| Foundation | 4 hours | Parsing & reconstruction |
| Intelligence | 8 hours | Phase detection, context, decisions |
| Redaction | 3 hours | PII safety |
| Generation | 8 hours | Blog + interactive modes |
| Polish | 6 hours | CLI, docs, examples |
| Publishing | 2 hours | npm, GitHub Actions |
| **Total** | **~3 days** | Assuming 2 people working in parallel |

---

## Cost Estimation

### GPT-5-nano Usage per Session

Assuming average session: 30 messages, ~50K tokens total

**Phase Detection:**
- Input: ~3K tokens per window × 10 windows = 30K tokens
- Output: ~500 tokens (phase classifications)
- Cost: (30K × $0.05 + 500 × $0.40) / 1M = **$0.0017**

**PII Redaction:**
- Input: ~50K tokens (full session)
- Output: ~50K tokens (redacted session)
- Cost: (50K × $0.05 + 50K × $0.40) / 1M = **$0.0225**

**Total per session**: ~**$0.024** (less than 3 cents!)

Ultra cost-effective for high-volume usage.

---

## Repository Structure

```
github.com/[your-username]/claude-code-blog-generator
│
├─ README.md (Project overview, quick start)
├─ PLAN.md (This file - implementation plan)
├─ LICENSE (MIT or your choice)
├─ package.json
├─ src/ (Source code as outlined above)
├─ tests/ (Comprehensive test suite)
├─ examples/ (Example outputs)
└─ docs/ (Detailed documentation)
```

---

## Next Actions

1. ✅ Create this PLAN.md
2. ⏳ Initialize GitHub repository
3. ⏳ Push initial commit with PLAN.md and README.md
4. ⏳ Wilhelm reviews and provides feedback
5. ⏳ Divide work: You and Wilhelm pick phases to implement
6. ⏳ Start parallel development

---

## Notes

- Use GPT-5-nano for all AI operations (cost-effective, fast)
- Prioritize educational value over technical completeness
- Mitchell's post is the gold standard for narrative structure
- AmpCode's minimap is good; add semantic chunking to make it great
- Remember: This is about **learning and teaching**, not just logging

---

**Last Updated**: November 1, 2025
**Authors**: You & Wilhelm
**Status**: Planning → Ready for implementation
