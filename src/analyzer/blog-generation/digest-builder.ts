/**
 * Session Digest Builder
 *
 * Converts a full session (37k+ tokens) into a compact digest (~3k tokens)
 * for efficient meta-analysis with gpt-5-nano
 */

export interface ToolSummary {
  tool_name: string;
  count: number;
  first_used_at_msg: number;
  last_used_at_msg: number;
  sample_inputs?: string[];
}

export interface DecisionPoint {
  message_index: number;
  tool_used: string;
  snippet: string;
}

export interface SessionDigest {
  session_opening: {
    initial_request: string;
    early_context: string[];
  };
  session_stats: {
    total_messages: number;
    duration_estimate_minutes: number;
    message_types: Record<string, number>;
  };
  tool_summary: ToolSummary[];
  files_created: string[];
  files_modified: string[];
  files_read: string[];
  decision_points: DecisionPoint[];
  session_ending: {
    final_messages: string[];
    final_tool_uses: string[];
  };
  phase_transitions: Array<{
    message_index: number;
    indicator: string;
  }>;
  model?: string;
}

export function createSessionDigest(messages: any[]): SessionDigest {
  const digest: SessionDigest = {
    session_opening: {
      initial_request: '',
      early_context: [],
    },
    session_stats: {
      total_messages: messages.length,
      duration_estimate_minutes: 0,
      message_types: {},
    },
    tool_summary: [],
    files_created: [],
    files_modified: [],
    files_read: [],
    decision_points: [],
    session_ending: {
      final_messages: [],
      final_tool_uses: [],
    },
    phase_transitions: [],
  };

  // Extract opening messages
  const userMessages = messages.filter((m) => m.type === 'user');
  if (userMessages.length > 0) {
    const firstMsg = userMessages[0];
    digest.session_opening.initial_request = extractTextContent(firstMsg).slice(
      0,
      500
    );

    // Get next 2-4 user messages for context
    for (let i = 1; i < Math.min(5, userMessages.length); i++) {
      const text = extractTextContent(userMessages[i]).slice(0, 200);
      if (text && text !== '[no text content]') {
        digest.session_opening.early_context.push(text);
      }
    }
  }

  // Calculate stats
  const msgTypes: Record<string, number> = {};
  messages.forEach((m) => {
    msgTypes[m.type] = (msgTypes[m.type] || 0) + 1;
  });
  digest.session_stats.message_types = msgTypes;

  // Estimate duration from timestamps
  const timestamps = messages
    .filter((m) => m.timestamp)
    .map((m) => new Date(m.timestamp).getTime());
  if (timestamps.length > 1) {
    const duration = (Math.max(...timestamps) - Math.min(...timestamps)) / 1000 / 60;
    digest.session_stats.duration_estimate_minutes = Math.round(duration);
  }

  // Extract model from first assistant message that has one
  for (const msg of messages) {
    if (msg.type === 'assistant' && msg.message?.model) {
      digest.model = msg.message.model;
      break;
    }
  }

  // Build tool summary
  const toolUsage: Map<
    string,
    { count: number; firstMsg: number; lastMsg: number; samples: string[] }
  > = new Map();

  messages.forEach((msg, idx) => {
    if (msg.type === 'assistant' && msg.message?.content) {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use') {
            const toolName = block.name;
            if (!toolUsage.has(toolName)) {
              toolUsage.set(toolName, {
                count: 0,
                firstMsg: idx,
                lastMsg: idx,
                samples: [],
              });
            }
            const usage = toolUsage.get(toolName)!;
            usage.count++;
            usage.lastMsg = idx;

            // Collect file paths
            if (block.input?.file_path) {
              const filePath = block.input.file_path;
              if (toolName === 'Write' && !digest.files_created.includes(filePath)) {
                digest.files_created.push(filePath);
              } else if (
                toolName === 'Edit' &&
                !digest.files_modified.includes(filePath)
              ) {
                digest.files_modified.push(filePath);
              } else if (
                toolName === 'Read' &&
                !digest.files_read.includes(filePath)
              ) {
                digest.files_read.push(filePath);
              }
            }

            // Sample inputs for complex tools
            if (usage.samples.length < 2 && block.input) {
              const sample = JSON.stringify(block.input).slice(0, 100);
              usage.samples.push(sample);
            }
          }
        }
      }
    }
  });

  // Convert to tool summary
  digest.tool_summary = Array.from(toolUsage.entries())
    .map(([tool_name, usage]) => ({
      tool_name,
      count: usage.count,
      first_used_at_msg: usage.firstMsg,
      last_used_at_msg: usage.lastMsg,
      sample_inputs: usage.samples.length > 0 ? usage.samples : undefined,
    }))
    .sort((a, b) => b.count - a.count); // Sort by frequency

  // Limit file lists
  digest.files_read = digest.files_read.slice(0, 10);

  // Find decision points
  messages.forEach((msg, idx) => {
    if (msg.type === 'assistant' && msg.message?.content) {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (
            block.type === 'tool_use' &&
            (block.name === 'AskUserQuestion' ||
              block.name === 'ExitPlanMode' ||
              block.name === 'Task')
          ) {
            const snippet = extractTextContent(msg).slice(0, 200);
            digest.decision_points.push({
              message_index: idx,
              tool_used: block.name,
              snippet,
            });
          }
        }
      }
    }
  });

  // Find phase transitions
  messages.forEach((msg, idx) => {
    if (msg.type === 'assistant' && msg.message?.content) {
      const content = msg.message.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use' && block.name === 'ExitPlanMode') {
            digest.phase_transitions.push({
              message_index: idx,
              indicator: 'ExitPlanMode called',
            });
          }
        }
      }
    }

    // Look for error indicators
    const text = extractTextContent(msg);
    if (text.toLowerCase().includes('error') && text.length < 500) {
      digest.phase_transitions.push({
        message_index: idx,
        indicator: `Error: ${text.slice(0, 100)}`,
      });
    }
  });

  // Extract ending context
  const lastAssistantMsgs = messages
    .filter((m) => m.type === 'assistant')
    .slice(-3);
  digest.session_ending.final_messages = lastAssistantMsgs.map((m) =>
    extractTextContent(m).slice(0, 200)
  );

  const lastTools = new Set<string>();
  lastAssistantMsgs.forEach((msg) => {
    if (msg.message?.content && Array.isArray(msg.message.content)) {
      msg.message.content.forEach((block: any) => {
        if (block.type === 'tool_use') {
          lastTools.add(block.name);
        }
      });
    }
  });
  digest.session_ending.final_tool_uses = Array.from(lastTools);

  return digest;
}

function extractTextContent(msg: any): string {
  if (!msg.message?.content) return '[no text content]';

  const content = msg.message.content;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join(' ');
  }

  return '[no text content]';
}
