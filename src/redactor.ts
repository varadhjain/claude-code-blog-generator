/**
 * PII Redactor - Scans content for sensitive information and redacts it.
 * Used before publishing to Gist, Dev.to, Hashnode, etc.
 */

interface RedactionResult {
  content: string;
  redactionCount: number;
  redactedTypes: string[];
}

// Patterns ordered from most specific to least specific
const REDACTION_PATTERNS: Array<{ name: string; pattern: RegExp; replacement: string }> = [
  // API keys (must come before generic tokens)
  { name: 'Anthropic API key', pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g, replacement: '[REDACTED_ANTHROPIC_KEY]' },
  { name: 'OpenAI API key', pattern: /sk-proj-[a-zA-Z0-9_-]{20,}/g, replacement: '[REDACTED_OPENAI_KEY]' },
  { name: 'OpenAI API key (legacy)', pattern: /sk-[a-zA-Z0-9]{40,}/g, replacement: '[REDACTED_API_KEY]' },
  { name: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/g, replacement: '[REDACTED_AWS_KEY]' },
  { name: 'AWS secret key', pattern: /(?<=AWS_SECRET_ACCESS_KEY[=:]\s*)[A-Za-z0-9/+=]{40}/g, replacement: '[REDACTED_AWS_SECRET]' },
  { name: 'GitHub token', pattern: /gh[ps]_[A-Za-z0-9_]{36,}/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { name: 'Generic secret', pattern: /(?<=(?:secret|token|password|api_key|apikey|auth)[=:]\s*["']?)[A-Za-z0-9_\-]{20,}/gi, replacement: '[REDACTED_SECRET]' },

  // Connection strings
  { name: 'Database URL', pattern: /(?:postgres|mysql|mongodb|redis):\/\/[^\s"']+/g, replacement: '[REDACTED_DB_URL]' },

  // Email addresses
  { name: 'Email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[REDACTED_EMAIL]' },

  // IP addresses (v4)
  { name: 'IP address', pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g, replacement: '[REDACTED_IP]' },

  // Home directory paths (macOS/Linux)
  { name: 'Home path', pattern: /\/Users\/[a-zA-Z0-9._-]+/g, replacement: '/Users/[REDACTED_USER]' },
  { name: 'Home path (Linux)', pattern: /\/home\/[a-zA-Z0-9._-]+/g, replacement: '/home/[REDACTED_USER]' },

  // Private key blocks
  { name: 'Private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, replacement: '[REDACTED_PRIVATE_KEY]' },
];

export function redactContent(content: string): RedactionResult {
  let redacted = content;
  let redactionCount = 0;
  const redactedTypes = new Set<string>();

  for (const { name, pattern, replacement } of REDACTION_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    const matches = redacted.match(pattern);
    if (matches) {
      redactionCount += matches.length;
      redactedTypes.add(name);
      redacted = redacted.replace(pattern, replacement);
    }
  }

  return {
    content: redacted,
    redactionCount,
    redactedTypes: Array.from(redactedTypes),
  };
}

export function redactFiles(files: Map<string, string>): {
  files: Map<string, string>;
  totalRedactions: number;
  summary: string;
} {
  let totalRedactions = 0;
  const allTypes = new Set<string>();
  const redactedFiles = new Map<string, string>();

  for (const [filename, content] of files) {
    const result = redactContent(content);
    redactedFiles.set(filename, result.content);
    totalRedactions += result.redactionCount;
    result.redactedTypes.forEach(t => allTypes.add(t));
  }

  const summary = totalRedactions > 0
    ? `🔒 Redacted ${totalRedactions} sensitive item(s): ${Array.from(allTypes).join(', ')}`
    : '✅ No sensitive content detected';

  return { files: redactedFiles, totalRedactions, summary };
}
