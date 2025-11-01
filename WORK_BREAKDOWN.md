# Work Breakdown

Pick a module and build it. They can be done in parallel.

## Module 1: Session Parser
**File**: `src/parser/session-parser.ts`

**Input**: Session ID (e.g., "abc-123-def")
**Output**: Array of parsed messages

**Tasks**:
- [ ] Find session file in `~/.claude/projects/[project]/[session-id].jsonl`
- [ ] Stream read JSONL (one JSON per line)
- [ ] Parse each line into `Message` type (see `src/types/index.ts`)
- [ ] Reconstruct conversation order using `parentUuid` references
- [ ] Extract tool usage (Read, Write, Bash, etc.)
- [ ] Handle subagent messages (where `isSidechain: true`)

**Test**: Can parse and reconstruct any Claude Code session

---

## Module 2: Phase Detector
**File**: `src/analyzer/phase-detector.ts`

**Input**: Array of messages
**Output**: Array of phases with type and message ranges

**Tasks**:
- [ ] Set up OpenAI client for GPT-5-nano
- [ ] Analyze messages in windows (3-5 messages at a time)
- [ ] Detect tool patterns:
  - Read/Glob/Grep → "setup"
  - Write/Edit → "coding"
  - Bash with errors → "debugging"
- [ ] Call GPT-5-nano to classify each window
- [ ] Merge consecutive same-phase windows
- [ ] Detect decision points (major pivots)

**Prompt template**:
```
Analyze these Claude Code messages.
Tools used: [Read, Glob, Write]
Messages: [...]

Classify phase as: setup | planning | thinking | coding | testing | debugging | refinement | decision_point

Return JSON: {phase: "coding", objective: "...", isTransition: true}
```

**Test**: Correctly identifies phases in sample sessions

---

## Module 3: Context Tracker
**File**: `src/analyzer/context-tracker.ts`

**Input**: Messages + detected phases
**Output**: SessionContext object

**Tasks**:
- [ ] Track current objective from messages
- [ ] Track active files from Write/Edit operations
- [ ] Extract approach from planning discussions
- [ ] Record key decisions at decision points
- [ ] Update context on each phase transition

**Context State**:
```typescript
{
  currentObjective: "Implement auth system",
  activeFiles: ["src/auth.ts", "src/middleware.ts"],
  approachTaken: "JWT with refresh tokens",
  keyDecisions: [{msg: 15, decision: "Switched from sessions to JWT"}],
  openQuestions: ["How to handle token expiry?"]
}
```

**Test**: Maintains accurate context throughout long sessions

---

## Module 4: PII Redactor
**File**: `src/redactor/pii-redactor.ts`

**Input**: Message content
**Output**: Redacted message content

**Tasks**:
- [ ] Use GPT-5-nano to detect PII
- [ ] Redact file paths: `/Users/john/projects/app/src/foo.ts` → `<project>/src/foo.ts`
- [ ] Redact usernames: `john.doe` → `<user>`
- [ ] Redact emails: `john@company.com` → `<email>`
- [ ] Redact API keys: `sk_live_abc123` → `<api-key>`
- [ ] Preserve code structure and readability
- [ ] Support redaction levels (aggressive/balanced/minimal)

**Test**: Redacts PII without breaking code

---

## Module 5: Blog Generator
**File**: `src/generator/blog-generator.ts`

**Input**: Parsed session + phases + context
**Output**: Markdown blog post

**Tasks**:
- [ ] Generate title from session objective
- [ ] Create problem hook from first user message
- [ ] Generate phase sections with narratives
- [ ] Extract and contextualize code snippets
- [ ] Highlight decision points and pivots
- [ ] Add "lessons learned" section
- [ ] Support multiple templates (blog, tutorial, postmortem)
- [ ] Add metadata (date, duration, token usage)

**Test**: Generates readable, engaging blog posts

---

## Module 6: Thread Generator
**File**: `src/generator/thread-generator.ts`

**Input**: Parsed session + phases
**Output**: HTML with interactive minimap

**Tasks**:
- [ ] Generate message-by-message view with phase labels
- [ ] Create sidebar navigation with phase links
- [ ] Add persistent context bar at top
- [ ] Implement jump links between related messages
- [ ] Make tool executions collapsible
- [ ] Style with CSS (clean, readable)
- [ ] Add minimal JS for navigation

**Test**: Interactive HTML loads and navigates smoothly

---

## Module 7: CLI Commands
**File**: `src/cli/commands/generate.ts`, `src/cli/commands/list.ts`

**Input**: CLI arguments
**Output**: Generated files

**Tasks**:
- [ ] Implement `generate` command
  - Parse CLI options
  - Load session
  - Run pipeline: parse → analyze → redact → generate
  - Write output file
  - Show progress/status
- [ ] Implement `list` command
  - Find sessions for current project
  - Show session IDs with timestamps
  - Support `--current` flag for latest session
- [ ] Add error handling
- [ ] Add config file support (`.blog-post-generator.json`)

**Test**: CLI works end-to-end

---

## Module 8: Utilities
**File**: `src/utils/openai-client.ts`, `src/utils/session-locator.ts`

**Tasks**:
- [ ] OpenAI client wrapper for GPT-5-nano
- [ ] Session locator (map project path → Claude session directory)
- [ ] File helpers (read JSONL streams, write output)
- [ ] Config loader (env vars + config file)

---

## Coordination Strategy

**Option A: Vertical Slices**
- Person 1: Modules 1, 2, 3 (parsing + analysis)
- Person 2: Modules 4, 5, 6 (redaction + generation)
- Together: Module 7, 8 (CLI + utils)

**Option B: Full Stack**
- Person 1: Build minimal version of all modules for "auto blog" mode
- Person 2: Add "interactive thread" mode + enhancements
- Merge and polish together

**Option C: Feature-based**
- Person 1: Core pipeline (parse → phase detect → blog)
- Person 2: Advanced features (PII redaction, interactive mode, CLI polish)

Choose what makes sense for your working style.
