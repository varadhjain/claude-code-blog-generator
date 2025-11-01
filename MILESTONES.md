# Milestones

Work independently on these. Each milestone is standalone.

---

## Milestone 1: Parse Sessions ⭐ START HERE
**Goal**: Read and parse Claude Code session files

**Owner**: _____

**Files**:
- `src/parser/session-parser.ts`
- `src/utils/session-locator.ts`
- `tests/parser/session-parser.test.ts`

**Tasks**:
- [ ] Find session file: `~/.claude/projects/[project]/[session-id].jsonl`
- [ ] Stream read JSONL (one JSON object per line)
- [ ] Parse each line into `Message` type
- [ ] Reconstruct conversation order using `parentUuid`
- [ ] Extract tool usage from messages
- [ ] Write tests with fixture data

**Input**: Session ID string (e.g., "abc-123-def")
**Output**: `Message[]` array

**Test**:
```typescript
const messages = await parseSession('abc-123-def');
console.log(messages.length); // Should return all messages
console.log(messages[0].type); // 'user' or 'assistant'
```

**Can start**: ✅ Now

---

## Milestone 2: Detect Phases ⭐ START HERE
**Goal**: Classify messages into semantic phases

**Owner**: _____

**Files**:
- `src/analyzer/phase-detector.ts`
- `src/utils/openai-client.ts`
- `tests/analyzer/phase-detector.test.ts`

**Tasks**:
- [ ] Set up OpenAI client for GPT-5-nano
- [ ] Analyze tool patterns (Read/Write/Bash)
- [ ] Window-based analysis (3-5 messages)
- [ ] Write prompt for GPT-5-nano classification
- [ ] Merge consecutive same-phase windows
- [ ] Write tests

**Input**: `Message[]`
**Output**: `Phase[]` with types (setup, coding, debugging, etc.)

**Prompt template**:
```
Messages: [user asks for dark mode, assistant uses Read, Glob]
Tools: [Read, Glob]

Classify phase: setup | coding | debugging | testing | planning

Return JSON: {phase: "setup", objective: "explore codebase"}
```

**Test**:
```typescript
const phases = await detectPhases(messages);
console.log(phases[0].type); // 'setup'
console.log(phases[1].type); // 'coding'
```

**Can start**: ✅ Now (independent of Milestone 1, just mock message data)

---

## Milestone 3: Track Context
**Goal**: Maintain session context (objectives, files, decisions)

**Owner**: _____

**Files**:
- `src/analyzer/context-tracker.ts`
- `tests/analyzer/context-tracker.test.ts`

**Tasks**:
- [ ] Track current objective from messages
- [ ] Track active files from Write/Edit operations
- [ ] Extract approach from planning discussions
- [ ] Record key decisions at decision points
- [ ] Update on phase transitions

**Input**: `Message[]` + `Phase[]`
**Output**: `SessionContext` object

**Test**:
```typescript
const context = await trackContext(messages, phases);
console.log(context.currentObjective); // "Implement auth"
console.log(context.activeFiles); // ["src/auth.ts"]
```

**Depends on**: Milestones 1, 2

---

## Milestone 4: Redact PII
**Goal**: Remove sensitive information from messages

**Owner**: _____

**Files**:
- `src/redactor/pii-redactor.ts`
- `tests/redactor/pii-redactor.test.ts`

**Tasks**:
- [ ] Use GPT-5-nano to detect PII
- [ ] Redact file paths: `/Users/john/...` → `<project>/...`
- [ ] Redact usernames, emails, API keys
- [ ] Preserve code structure
- [ ] Support redaction levels (aggressive/balanced/minimal)

**Input**: Message content string
**Output**: Redacted string

**Test**:
```typescript
const redacted = await redactPII('/Users/john/app/src/auth.ts');
console.log(redacted); // '<project>/src/auth.ts'
```

**Can start**: ✅ Now (independent, just needs OpenAI client)

---

## Milestone 5: Generate Blog Post
**Goal**: Create Mitchell-style narrative blog post

**Owner**: _____

**Files**:
- `src/generator/blog-generator.ts`
- `src/generator/templates/blog.ts`
- `tests/generator/blog-generator.test.ts`

**Tasks**:
- [ ] Generate title from objective
- [ ] Create problem hook from first message
- [ ] Generate phase sections with narratives
- [ ] Extract and contextualize code snippets
- [ ] Highlight decision points
- [ ] Add lessons learned section
- [ ] Render as Markdown

**Input**: `Message[]` + `Phase[]` + `SessionContext`
**Output**: Markdown string

**Test**:
```typescript
const blog = await generateBlog(messages, phases, context);
console.log(blog); // Full markdown blog post
```

**Depends on**: Milestones 1, 2, 3

---

## Milestone 6: Generate Interactive Thread
**Goal**: Create HTML with minimap navigation

**Owner**: _____

**Files**:
- `src/generator/thread-generator.ts`
- `src/generator/templates/thread.ts`
- `tests/generator/thread-generator.test.ts`

**Tasks**:
- [ ] Message-by-message view with phase labels
- [ ] Sidebar navigation with phase links
- [ ] Persistent context bar
- [ ] Jump links between related messages
- [ ] Collapsible tool executions
- [ ] CSS styling
- [ ] Minimal JS for navigation

**Input**: `Message[]` + `Phase[]` + `SessionContext`
**Output**: HTML string

**Test**: Open HTML in browser, navigation works

**Depends on**: Milestones 1, 2, 3

---

## Milestone 7: Build CLI
**Goal**: Command-line interface

**Owner**: _____

**Files**:
- `src/cli/commands/generate.ts`
- `src/cli/commands/list.ts`
- `tests/cli/cli.test.ts`

**Tasks**:
- [ ] Implement `generate` command (runs full pipeline)
- [ ] Implement `list` command (finds sessions)
- [ ] Config file support (`.blog-post-generator.json`)
- [ ] Error handling
- [ ] Progress indicators

**Input**: CLI args
**Output**: Generated blog file

**Test**:
```bash
blog-post-generator generate abc-123 --output test.md
cat test.md # Should show blog post
```

**Depends on**: All previous milestones

---

## Milestone 8: Polish & Ship
**Goal**: Make it production-ready

**Owner**: Both

**Tasks**:
- [ ] End-to-end testing
- [ ] Error handling everywhere
- [ ] Performance optimization
- [ ] Generate example blog posts
- [ ] Update README with real examples
- [ ] Set up GitHub Actions CI/CD
- [ ] npm package config
- [ ] Publish v1.0.0

**Can start**: After Milestone 7

---

## Who Should Do What?

### Option A: Vertical Split
- **Person 1**: Milestones 1, 2, 3 (parsing + analysis)
- **Person 2**: Milestones 4, 5, 6 (redaction + generation)
- **Both**: Milestone 7, 8 (CLI + polish)

### Option B: Feature Split
- **Person 1**: End-to-end "auto blog" (M1→M2→M5→M7)
- **Person 2**: End-to-end "interactive thread" (M1→M2→M6→M7)
- **Both**: M3, M4, M8 (shared components + polish)

### Option C: Parallel Start
- **Person 1**: M1 (parser) - requires understanding session files
- **Person 2**: M2 (phase detector) - can mock data
- Then coordinate on remaining milestones

---

## Progress Tracking

Update `PROGRESS.md` as you complete milestones. Mark:
- Owner name
- Status: 🔴 Not started → 🟡 In progress → 🟢 Done
- Check off individual tasks

---

## Dependencies

```
M1 (Parser) ────┬───→ M3 (Context) ───┬───→ M5 (Blog) ─────┐
                │                     │                    │
M2 (Phases) ────┴─────────────────────┴───→ M6 (Thread) ───┼──→ M7 (CLI) ──→ M8 (Ship)
                                                            │
M4 (PII) ───────────────────────────────────────────────────┘
```

**Can start immediately**: M1, M2, M4 (independent)
**Need M1+M2**: M3, M5, M6
**Need everything**: M7, M8

---

Pick a milestone, claim it in `PROGRESS.md`, and start building! 🚀
