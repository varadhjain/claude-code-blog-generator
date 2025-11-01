# What's Captured in Claude Code Transcripts

Complete reference for Claude Code session file format (`.jsonl` files).

## File Format

- **Format**: JSONL (JSON Lines) - one JSON object per line
- **Location**: `~/.claude/projects/[encoded-project-path]/[session-id].jsonl`
- **Encoding**: UTF-8 text
- **Structure**: Each line is a complete, valid JSON object

---

## 1. Assistant Responses ✅

Every assistant message includes:
- Full text responses
- Model information (e.g., `claude-sonnet-4-5-20250929`)
- Message IDs
- Timestamps

```json
{
  "type": "assistant",
  "message": {
    "role": "assistant",
    "content": [
      {
        "type": "text",
        "text": "I'll help you with that..."
      }
    ],
    "model": "claude-sonnet-4-5-20250929",
    "id": "msg_...",
    "usage": {...}
  },
  "uuid": "...",
  "timestamp": "2025-11-01T17:08:39.625Z"
}
```

---

## 2. Tool Calls ✅

Complete tool usage with:
- Tool name (Bash, Read, Task, Write, Edit, etc.)
- Tool input parameters
- Unique tool IDs

**Example:**
```json
{
  "type": "tool_use",
  "id": "toolu_01SPaEUMG5WD8S1NXR1nr2tv",
  "name": "Task",
  "input": {
    "description": "Explore codebase structure",
    "prompt": "I need to understand the current codebase...",
    "subagent_type": "Plan"
  }
}
```

---

## 3. Tool Results ✅

Full output from every tool execution:
- Success results with complete output
- Error states (`"is_error": true`)
- User interruptions
- Approval results from AskUserQuestion

**Example:**
```json
{
  "type": "tool_result",
  "tool_use_id": "toolu_...",
  "content": "... full bash output or file contents...",
  "is_error": false
}
```

---

## 4. Token Usage ✅

Detailed token accounting for every assistant message:

```json
"usage": {
  "input_tokens": 8,
  "cache_creation_input_tokens": 4422,  // First-time caching
  "cache_read_input_tokens": 12112,     // Reused from cache
  "output_tokens": 8,
  "service_tier": "standard"
}
```

This tracks:
- **input_tokens**: Tokens consumed from user message
- **cache_creation_input_tokens**: Tokens cached for first time
- **cache_read_input_tokens**: Tokens reused from cache
- **output_tokens**: Tokens generated in response

Enables:
- Exact cost calculation per message
- Cache efficiency analysis
- Total conversation cost tracking
- Token usage pattern analysis

---

## 5. Extended Thinking ✅

When thinking is enabled, the full thinking content is captured:

```json
{
  "type": "thinking",
  "thinking": "Let me break down what the user is saying:\n\n1. Main journal page is too messy...",
  "signature": "ErUNCkYICRgCKkCJFY0LRh4XD+T786iS..."
}
```

The signature appears to be cryptographic verification of the thinking content.

---

## 6. User Messages ✅

```json
{
  "type": "user",
  "message": {
    "role": "user",
    "content": "Can you help me build a feature?"
  },
  "uuid": "...",
  "parentUuid": "...",
  "timestamp": "...",
  "cwd": "/Users/user/project",
  "gitBranch": "main"
}
```

Includes:
- Full message text
- Working directory
- Current git branch
- Conversation threading (`parentUuid`)

---

## 7. File History Snapshots ✅

Tracks file state throughout the session:

```json
{
  "type": "file-history-snapshot",
  "messageId": "...",
  "snapshot": {
    "messageId": "...",
    "trackedFileBackups": {},
    "timestamp": "2025-11-01T17:08:39.625Z"
  }
}
```

---

## 8. Subagent Calls ✅

When Task tool is used, subagent messages are:
- Marked with `"isSidechain": true`
- Include `"agentId"` field
- Stored in separate files: `agent-[id].jsonl`

---

## Complete Data Captured Summary

| Data Type           | Captured? | Details                                              |
|---------------------|-----------|------------------------------------------------------|
| User messages       | ✅         | Full text, timestamps, working directory, git branch |
| Assistant responses | ✅         | Full text responses with model info                  |
| Tool calls          | ✅         | Tool name, input parameters, unique IDs              |
| Tool results        | ✅         | Complete output, error states, interruptions         |
| Thinking content    | ✅         | Full extended thinking when enabled + signature      |
| Token usage         | ✅         | Input, output, cache creation, cache reads           |
| Metadata            | ✅         | Timestamps, session IDs, UUIDs, git context          |
| File snapshots      | ✅         | File state tracking throughout session               |
| Subagent calls      | ✅         | Stored in separate agent-*.jsonl files               |
| User approvals      | ✅         | Responses to AskUserQuestion tool                    |

---

## Token Usage Detail

Every assistant message includes granular token accounting:

```json
"usage": {
  "input_tokens": 8,
  "cache_creation_input_tokens": 4422,  // First-time caching
  "cache_read_input_tokens": 12112,     // Reused from cache
  "output_tokens": 8,
  "service_tier": "standard"
}
```

**Use cases:**
- Calculate exact costs per message
- Analyze cache efficiency
- Track total conversation cost
- Identify token usage patterns

---

## Bottom Line

**Everything is captured!** This means you can reconstruct:
- ✅ The entire conversation flow
- ✅ Every tool that was called and its result
- ✅ All thinking process (when enabled)
- ✅ Exact token costs
- ✅ Decision points and approvals
- ✅ File modifications over time

**Perfect for building educational blog posts from sessions!**

---

## Example Message Flow

```
User Message
  ↓
Assistant Response (with thinking)
  ↓
Tool Call (e.g., Read file)
  ↓
Tool Result (file contents)
  ↓
Assistant Response (analysis)
  ↓
Tool Call (e.g., Edit file)
  ↓
Tool Result (edit confirmation)
  ↓
User Message (feedback)
  ↓
...
```

Each step is a separate JSON line in the JSONL file, connected by `uuid` and `parentUuid` references.
