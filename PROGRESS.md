# Progress Tracker

Track what's done, in-progress, and todo.

## Setup ✅
- [x] GitHub repo created
- [x] TypeScript project structure
- [x] Type definitions (`src/types/index.ts`)
- [x] CLI skeleton (`src/cli/index.ts`)
- [x] Planning docs

## Core Modules

### Module 1: Session Parser
**Owner**: _TBD_
**Status**: 🔴 Not started

- [ ] Find session files in `~/.claude/projects/`
- [ ] Parse JSONL format
- [ ] Reconstruct conversation with `parentUuid`
- [ ] Extract tool usage
- [ ] Handle subagents
- [ ] Write tests

### Module 2: Phase Detector
**Owner**: _TBD_
**Status**: 🔴 Not started

- [ ] OpenAI GPT-5-nano integration
- [ ] Tool pattern analysis
- [ ] Phase classification prompt
- [ ] Window-based analysis
- [ ] Merge consecutive phases
- [ ] Decision point detection
- [ ] Write tests

### Module 3: Context Tracker
**Owner**: _TBD_
**Status**: 🔴 Not started

- [ ] Track current objective
- [ ] Track active files
- [ ] Extract approach
- [ ] Record decisions
- [ ] Update on phase transitions
- [ ] Write tests

### Module 4: PII Redactor
**Owner**: _TBD_
**Status**: 🔴 Not started

- [ ] GPT-5-nano redaction
- [ ] File path redaction
- [ ] Username redaction
- [ ] Email redaction
- [ ] API key redaction
- [ ] Redaction levels (aggressive/balanced/minimal)
- [ ] Write tests

### Module 5: Blog Generator
**Owner**: _TBD_
**Status**: 🔴 Not started

- [ ] Title generation
- [ ] Problem hook
- [ ] Phase narratives
- [ ] Code snippet extraction
- [ ] Decision point highlights
- [ ] Lessons learned section
- [ ] Template support
- [ ] Metadata (date, duration, tokens)
- [ ] Write tests

### Module 6: Thread Generator
**Owner**: _TBD_
**Status**: 🔴 Not started

- [ ] Message-by-message view
- [ ] Phase labels
- [ ] Sidebar navigation
- [ ] Context bar
- [ ] Jump links
- [ ] Collapsible tools
- [ ] CSS styling
- [ ] JavaScript navigation
- [ ] Write tests

### Module 7: CLI Commands
**Owner**: _TBD_
**Status**: 🔴 Not started

- [ ] `generate` command implementation
- [ ] `list` command implementation
- [ ] Config file support
- [ ] Error handling
- [ ] Progress indicators
- [ ] Write tests

### Module 8: Utilities
**Owner**: _TBD_
**Status**: 🔴 Not started

- [ ] OpenAI client wrapper
- [ ] Session locator
- [ ] File helpers
- [ ] Config loader
- [ ] Write tests

## Documentation
- [ ] Usage examples
- [ ] API documentation
- [ ] Template customization guide
- [ ] PII redaction guide

## Polish
- [ ] End-to-end testing
- [ ] Error handling
- [ ] Performance optimization
- [ ] README examples with real output
- [ ] GitHub Actions CI/CD

## Release
- [ ] npm package setup
- [ ] Version 1.0.0
- [ ] Publish to npm
- [ ] Announcement

---

## Legend
- 🔴 Not started
- 🟡 In progress
- 🟢 Done
- ✅ Complete

---

**Update this file as you complete tasks!**

Assign owners, update status, check off tasks.
