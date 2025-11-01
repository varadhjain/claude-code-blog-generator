# Progress Tracker

See [MILESTONES.md](./MILESTONES.md) for details on each milestone.

---

## Setup ✅
- [x] GitHub repo created
- [x] TypeScript project structure
- [x] Type definitions (`src/types/index.ts`)
- [x] CLI skeleton (`src/cli/index.ts`)
- [x] Planning docs

---

## Milestone 1: Parse Sessions
**Owner**: _____
**Status**: 🔴 Not started

- [ ] Find session files in `~/.claude/projects/`
- [ ] Stream read JSONL format
- [ ] Parse into `Message[]`
- [ ] Reconstruct conversation with `parentUuid`
- [ ] Extract tool usage
- [ ] Write tests

---

## Milestone 2: Detect Phases
**Owner**: _____
**Status**: 🔴 Not started

- [ ] OpenAI GPT-5-nano client setup
- [ ] Tool pattern analysis
- [ ] Phase classification prompt
- [ ] Window-based analysis (3-5 messages)
- [ ] Merge consecutive phases
- [ ] Write tests

---

## Milestone 3: Track Context
**Owner**: _____
**Status**: 🔴 Not started

- [ ] Track current objective
- [ ] Track active files
- [ ] Extract approach
- [ ] Record decisions
- [ ] Update on phase transitions
- [ ] Write tests

---

## Milestone 4: Redact PII
**Owner**: _____
**Status**: 🔴 Not started

- [ ] GPT-5-nano PII detection
- [ ] File path redaction
- [ ] Username/email redaction
- [ ] API key redaction
- [ ] Redaction levels (aggressive/balanced/minimal)
- [ ] Write tests

---

## Milestone 5: Generate Blog Post
**Owner**: _____
**Status**: 🔴 Not started

- [ ] Title generation
- [ ] Problem hook
- [ ] Phase narratives
- [ ] Code snippet extraction
- [ ] Decision point highlights
- [ ] Lessons learned section
- [ ] Markdown rendering
- [ ] Write tests

---

## Milestone 6: Generate Interactive Thread
**Owner**: _____
**Status**: 🔴 Not started

- [ ] Message-by-message view
- [ ] Phase labels
- [ ] Sidebar navigation
- [ ] Context bar
- [ ] Jump links
- [ ] Collapsible tools
- [ ] CSS styling
- [ ] JS navigation
- [ ] Write tests

---

## Milestone 7: Build CLI
**Owner**: _____
**Status**: 🔴 Not started

- [ ] `generate` command (full pipeline)
- [ ] `list` command (find sessions)
- [ ] Config file support
- [ ] Error handling
- [ ] Progress indicators
- [ ] Write tests

---

## Milestone 8: Polish & Ship
**Owner**: Both
**Status**: 🔴 Not started

- [ ] End-to-end testing
- [ ] Error handling everywhere
- [ ] Performance optimization
- [ ] Generate example blog posts
- [ ] Update README with real examples
- [ ] GitHub Actions CI/CD
- [ ] npm package setup
- [ ] Publish v1.0.0

---

## Legend
- 🔴 Not started
- 🟡 In progress
- 🟢 Done
- ✅ Complete

---

**How to use**:
1. Pick a milestone from [MILESTONES.md](./MILESTONES.md)
2. Add your name as Owner
3. Change Status to 🟡 In progress
4. Check off tasks as you complete them
5. Change Status to 🟢 Done when finished
