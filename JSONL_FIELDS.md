# JSONL Fields Usage in ccblog

## Top-Level Entry Fields

| Field | Type | Used? | Purpose | Notes |
|-------|------|-------|---------|-------|
| `type` | string | ✅ YES | Determines message type (user/assistant/summary/system) | Core field for routing |
| `timestamp` | string | ✅ YES | Message timestamp | Displayed as formatted date/time |
| `message` | object | ✅ YES | Contains the actual message content | Core content field |
| `sessionId` | string | ❌ NO | Session identifier | Could be used for grouping |
| `uuid` | string | ❌ NO | Unique message identifier | Could be used for permalinks |
| `parentUuid` | string | ❌ NO | Parent message UUID | Could show conversation threading |
| `cwd` | string | ❌ NO | Working directory | Could show context |
| `gitBranch` | string | ❌ NO | Git branch name | Could show context |
| `version` | string | ❌ NO | Claude Code version | Could show in metadata |
| `userType` | string | ❌ NO | Type of user (external, etc.) | Internal metadata |
| `isSidechain` | boolean | ❌ NO | Whether message is in sidechain | Could affect display |
| `requestId` | string | ❌ NO | API request ID | Debugging info |
| `thinkingMetadata` | object | ❌ NO | Metadata about thinking process | Could show thinking stats |
| `isMeta` | boolean | ✅ YES | Whether message is meta | Used to skip meta messages |

## Message Object Fields

| Field | Type | Used? | Purpose | Notes |
|-------|------|-------|---------|-------|
| `role` | string | ✅ YES | Message role (user/assistant) | Used for validation |
| `content` | array | ✅ YES | Message content blocks | Core content field |
| `type` | string | ❌ NO | Message type | Redundant with top-level type |
| `id` | string | ❌ NO | Message ID | Could be used for linking |
| `model` | string | ❌ NO | Model used (e.g., claude-sonnet-4) | Could show in metadata |
| `stop_reason` | string | ❌ NO | Why model stopped (e.g., end_turn) | Could show completion reason |
| `stop_sequence` | string | ❌ NO | Stop sequence used | Internal metadata |
| `usage` | object | ❌ NO | Token usage stats | **IMPORTANT: Not displayed!** |

## Content Block Types

### TextContent
| Field | Type | Used? | Purpose |
|-------|------|-------|---------|
| `type` | "text" | ✅ YES | Identifies as text block |
| `text` | string | ✅ YES | The actual text content |

### ThinkingContent
| Field | Type | Used? | Purpose |
|-------|------|-------|---------|
| `type` | "thinking" | ✅ YES | Identifies as thinking block |
| `thinking` | string | ✅ YES | Thinking content (shown in collapsible) |

### ToolUse
| Field | Type | Used? | Purpose |
|-------|------|-------|---------|
| `type` | "tool_use" | ✅ YES | Identifies as tool use |
| `id` | string | ⚠️ PARTIAL | Tool use ID | Not displayed |
| `name` | string | ✅ YES | Tool name (e.g., "Bash", "Read") |
| `input` | object | ✅ YES | Tool parameters | Shown as JSON |

### ToolResult
| Field | Type | Used? | Purpose |
|-------|------|-------|---------|
| `type` | "tool_result" | ✅ YES | Identifies as tool result |
| `tool_use_id` | string | ❌ NO | Links to tool use | Could link tool use to result |
| `content` | string/array | ✅ YES | Tool output | Shown in code blocks (truncated >2000 chars) |

## Summary Entry Fields

| Field | Type | Used? | Purpose | Notes |
|-------|------|-------|---------|-------|
| `type` | "summary" | ✅ YES | Identifies as summary |
| `summary` | string | ✅ YES | AI-generated conversation summary | Shown at top of markdown |
| `leafUuid` | string | ❌ NO | UUID of leaf message | Could link to specific message |

## Entry Types

| Type | Used? | Notes |
|------|-------|-------|
| `user` | ✅ YES | Regular user messages (filtered if `isMeta` or tool results only) |
| `assistant` | ✅ YES | Assistant responses |
| `summary` | ✅ YES | Conversation summary (shown at top) |
| `system` | ✅ YES | System messages (shown in collapsible) |
| `file-history-snapshot` | ❌ NO | Ignored completely |

## Important Missing Features

1. **Token Usage** - Not extracted or displayed (available in `message.usage`)
   - `input_tokens`
   - `output_tokens`
   - `cache_creation_input_tokens`
   - `cache_read_input_tokens`

2. **Model Information** - Not shown (available in `message.model`)

3. **Working Directory Context** - Not shown (available in `cwd`)

4. **Git Context** - Not shown (available in `gitBranch`)

5. **Tool Result Linking** - Tool results aren't explicitly linked back to their tool uses

6. **Message Threading** - `parentUuid` could show conversation branches
