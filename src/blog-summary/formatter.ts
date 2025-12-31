/**
 * Formatter Utilities for Blog Summary
 *
 * Helper functions for formatting code, text, and dates
 */

// ============================================================================
// TEXT FORMATTING
// ============================================================================

/**
 * Truncate text to a maximum length with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

/**
 * Truncate code intelligently (try to break at newlines)
 */
export function truncateCode(code: string, maxLines: number): string {
  const lines = code.split('\n');
  if (lines.length <= maxLines) return code;

  const truncated = lines.slice(0, maxLines).join('\n');
  return truncated + '\n// ... (truncated)';
}

/**
 * Escape special characters for markdown
 */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/`/g, '\\`');
}

// ============================================================================
// CODE FORMATTING
// ============================================================================

/**
 * Format code snippet for display
 */
export function formatCodeSnippet(code: string, _language: string, maxLines: number = 20): string {
  const truncated = truncateCode(code, maxLines);
  return truncated;
}

/**
 * Clean up code indentation
 */
export function cleanIndentation(code: string): string {
  const lines = code.split('\n');

  // Find minimum indentation (ignoring empty lines)
  const minIndent = lines
    .filter(line => line.trim().length > 0)
    .reduce((min, line) => {
      const indent = line.match(/^\s*/)?.[0].length || 0;
      return Math.min(min, indent);
    }, Infinity);

  if (minIndent === Infinity || minIndent === 0) return code;

  // Remove minimum indentation from all lines
  return lines
    .map(line => line.substring(minIndent))
    .join('\n');
}

// ============================================================================
// DATE FORMATTING
// ============================================================================

/**
 * Format ISO date string for display
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Format relative time (e.g., "15 min into session")
 */
export function formatRelativeTime(timestampMs: number, sessionStartMs: number): string {
  const diffMs = timestampMs - sessionStartMs;
  const diffMinutes = Math.floor(diffMs / 60000);

  if (diffMinutes < 1) return '0 min';
  if (diffMinutes < 60) return `${diffMinutes} min`;

  const hours = Math.floor(diffMinutes / 60);
  const mins = diffMinutes % 60;

  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// ============================================================================
// URL FORMATTING
// ============================================================================

/**
 * Generate deep link to a specific message in the paginated viewer
 */
export function generateDeepLink(
  messageIndex: number,
  messagesPerPage: number = 50,
  baseUrl?: string
): string {
  const pageNum = Math.floor(messageIndex / messagesPerPage) + 1;
  const pageName = `page-${String(pageNum).padStart(3, '0')}.html`;
  const anchor = `#msg-${messageIndex}`;

  if (baseUrl) {
    return `${baseUrl}/${pageName}${anchor}`;
  }

  return `${pageName}${anchor}`;
}

// ============================================================================
// STATISTICS FORMATTING
// ============================================================================

/**
 * Format percentage
 */
export function formatPercentage(value: number, total: number): string {
  if (total === 0) return '0%';
  const percent = Math.round((value / total) * 100);
  return `${percent}%`;
}

/**
 * Format count with label
 */
export function formatCount(count: number, singular: string, plural?: string): string {
  if (count === 1) return `${count} ${singular}`;
  return `${count} ${plural || singular + 's'}`;
}
