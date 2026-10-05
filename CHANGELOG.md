# Changelog

All notable changes to this project. One line per release.

## 2026-10-05
- Weekly digest uses the local mail-service and its bare-address sender contract, reads only the bearer token without shell evaluation, and counts files from the actual run start with a macOS-compatible marker; live scheduled execution still needs its Downloads permission restored.

## v5 — 2026-04-26
- `ccblog reflect` — weekly retrospective from BM25 index, every claim cites `[sid:msg#]`, three tones, saves to `~/.ccblog/reflections/` with `share_status: private`.

## v4 — 2026-04-22
- Outbound-share gate (`share_status: local | reviewed | private`) + `ccblog review` TUI + Codex CLI as a second session source (auto-detected at `~/.codex/sessions/`).

## v3 — 2026-04-21
- BM25 full-text search over `~/.claude/projects/` (SQLite FTS5) + MCP server + `ccblog watch` live-tail. Zero network calls on the search path.

## v2 — earlier
- Agent knowledge network: structured learning extraction + MCP server.

## v1 — earlier
- Multi-provider blog generator (Anthropic / OpenAI), PII redactor, auto-capture hook.
