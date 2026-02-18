/**
 * HTML Generator for Annotated Session Viewer
 *
 * Combines session data, annotations, and phases into shareable HTML
 */

import Handlebars from 'handlebars';
import { marked } from 'marked';
import * as fs from 'fs/promises';
import * as path from 'path';
import { getInlineStyles } from './styles';
import type { AnnotatorResult } from '../user-annotations';

// ============================================================================
// TYPES
// ============================================================================

export interface SessionMessage {
  type: string;
  message?: {
    role: string;
    content: string | any[];
  };
  timestamp?: string;
  index: number;
}

export interface HTMLPage {
  filename: string;
  content: string;
}

export interface HTMLOutput {
  summary: string;          // index.html
  pages: HTMLPage[];        // page-001.html, page-002.html, etc.
}

export interface GeneratorOptions {
  sessionTitle: string;
  messagesPerPage?: number;
  date?: string;
  goal?: string;
  outcome?: string;
  model?: string;
}

// ============================================================================
// HANDLEBARS HELPERS
// ============================================================================

Handlebars.registerHelper('eq', function(a: any, b: any) {
  return a === b;
});

// ============================================================================
// TEMPLATE LOADING
// ============================================================================

const TEMPLATES_DIR = path.join(__dirname, 'templates');

let summaryTemplate: HandlebarsTemplateDelegate;
let sessionTemplate: HandlebarsTemplateDelegate;
let messageTemplate: HandlebarsTemplateDelegate;
let statsTemplate: HandlebarsTemplateDelegate;
let phaseNavTemplate: HandlebarsTemplateDelegate;

async function loadTemplates() {
  if (typeof summaryTemplate !== 'undefined') return; // Already loaded

  const [summary, session, message, stats, phaseNav] = await Promise.all([
    fs.readFile(path.join(TEMPLATES_DIR, 'summary.handlebars'), 'utf-8'),
    fs.readFile(path.join(TEMPLATES_DIR, 'session.handlebars'), 'utf-8'),
    fs.readFile(path.join(TEMPLATES_DIR, 'components', 'message.handlebars'), 'utf-8'),
    fs.readFile(path.join(TEMPLATES_DIR, 'components', 'stats.handlebars'), 'utf-8'),
    fs.readFile(path.join(TEMPLATES_DIR, 'components', 'phase-nav.handlebars'), 'utf-8'),
  ]);

  summaryTemplate = Handlebars.compile(summary);
  sessionTemplate = Handlebars.compile(session);
  messageTemplate = Handlebars.compile(message);
  statsTemplate = Handlebars.compile(stats);
  phaseNavTemplate = Handlebars.compile(phaseNav);
}

// ============================================================================
// CONTENT FORMATTING
// ============================================================================

// No special configuration needed for marked - we'll use default

/**
 * Extract text content from message (handles string or array format)
 */
function extractTextContent(content: string | any[]): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n\n');
  }
  return '';
}

/**
 * Format message content as HTML
 */
function formatMessageContent(message: SessionMessage): string {
  if (!message.message?.content) return '';

  const text = extractTextContent(message.message.content);

  // Convert markdown to HTML
  const html = marked.parse(text);

  return html as string;
}

/**
 * Format timestamp for display
 */
function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Convert raw model ID to human-readable name
 * e.g. "claude-sonnet-4-5-20250929" → "Claude Sonnet 4.5"
 */
function formatModelName(raw: string): string {
  // Strip trailing date suffix like -20250929
  const withoutDate = raw.replace(/-\d{8}$/, '');
  // Split on hyphens, then group consecutive numeric tokens with dots
  const parts = withoutDate.split('-');
  const result: string[] = [];
  let i = 0;
  while (i < parts.length) {
    if (/^\d+$/.test(parts[i])) {
      const nums: string[] = [];
      while (i < parts.length && /^\d+$/.test(parts[i])) {
        nums.push(parts[i++]);
      }
      result.push(nums.join('.'));
    } else {
      const w = parts[i++];
      result.push(w.charAt(0).toUpperCase() + w.slice(1));
    }
  }
  return result.join(' ');
}

/**
 * Format duration in human-readable form
 */
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// ============================================================================
// HTML GENERATION
// ============================================================================

/**
 * Generate stats HTML
 */
function generateStats(
  messages: SessionMessage[],
  annotations: AnnotatorResult,
  durationMinutes: number
): string {
  const stats = {
    totalMessages: messages.length,
    duration: formatDuration(durationMinutes),
    keyMoments: annotations.annotations.length,
    phases: annotations.phases.phases.length,
    toolsUsed: undefined as number | undefined
  };

  // Count unique tools used (if available)
  const toolsSet = new Set<string>();
  messages.forEach(msg => {
    if (msg.message?.content && Array.isArray(msg.message.content)) {
      msg.message.content.forEach((block: any) => {
        if (block.type === 'tool_use' && block.name) {
          toolsSet.add(block.name);
        }
      });
    }
  });
  if (toolsSet.size > 0) {
    stats.toolsUsed = toolsSet.size;
  }

  return statsTemplate(stats);
}

/**
 * Generate phase navigation HTML
 */
function generatePhaseNav(phases: AnnotatorResult['phases']): string {
  return phaseNavTemplate({ phases: phases.phases });
}

/**
 * Generate key moments timeline for summary page
 *
 * Creates a clickable timeline of annotated messages that links to specific pages.
 * Each moment shows:
 * - Relative time from session start (e.g., "15 min")
 * - The annotation text (what makes this moment significant)
 * - Color coding (green=new task, yellow=clarification, red=pivot)
 * - Deep link to the exact message on its paginated page
 */
function generateKeyMoments(
  annotations: AnnotatorResult,
  messages: SessionMessage[],
  firstMessageTimestamp?: string
): Array<{
  time: string;
  annotation: string;
  color: string;
  link: string;
}> {
  const moments: Array<{
    time: string;
    annotation: string;
    color: string;
    link: string;
  }> = [];

  const startTime = firstMessageTimestamp ? new Date(firstMessageTimestamp).getTime() : 0;

  annotations.annotations.forEach(ann => {
    // Find the message this annotation refers to
    const message = messages.find(m => m.index === ann.messageIndex);
    if (!message) return;

    // Calculate relative time from session start
    let timeStr = '';
    if (message.timestamp && startTime) {
      const msgTime = new Date(message.timestamp).getTime();
      const diffMinutes = Math.round((msgTime - startTime) / (1000 * 60));
      timeStr = diffMinutes > 0 ? `${diffMinutes} min` : 'Start';
    }

    // Determine which page this message is on (50 messages per page)
    const pageNumber = Math.floor(ann.messageIndex / 50) + 1;
    const pageFilename = `page-${String(pageNumber).padStart(3, '0')}.html`;

    moments.push({
      time: timeStr,
      annotation: ann.annotation,
      color: ann.color,
      link: `${pageFilename}#msg-${ann.messageIndex}` // Deep link with anchor
    });
  });

  return moments;
}

/**
 * Generate HTML for a single message
 */
function generateMessageHTML(
  message: SessionMessage,
  annotations: AnnotatorResult
): string {
  // Check if this message is annotated
  const annotation = annotations.annotations.find(a => a.messageIndex === message.index);

  const data = {
    index: message.index,
    role: message.message?.role || message.type,
    timestamp: formatTimestamp(message.timestamp),
    content: formatMessageContent(message),
    isKeyMessage: !!annotation,
    annotation: annotation?.annotation,
    annotationColor: annotation?.color || 'green'
  };

  return messageTemplate(data);
}

/**
 * Paginate messages into chunks
 *
 * Splits the full conversation into pages to keep HTML files manageable.
 * Default is 50 messages per page. For a 200-message session, this creates:
 * - page-001.html (messages 0-49)
 * - page-002.html (messages 50-99)
 * - page-003.html (messages 100-149)
 * - page-004.html (messages 150-199)
 */
function paginateMessages(
  messages: SessionMessage[],
  messagesPerPage: number = 50
): SessionMessage[][] {
  const pages: SessionMessage[][] = [];

  for (let i = 0; i < messages.length; i += messagesPerPage) {
    pages.push(messages.slice(i, i + messagesPerPage));
  }

  return pages;
}

/**
 * Generate summary page (index.html)
 */
async function generateSummaryPage(
  options: GeneratorOptions,
  messages: SessionMessage[],
  annotations: AnnotatorResult,
  durationMinutes: number
): Promise<string> {
  await loadTemplates();

  const firstMessage = messages.find(m => m.timestamp);
  const moments = generateKeyMoments(annotations, messages, firstMessage?.timestamp);

  const data = {
    sessionTitle: options.sessionTitle,
    date: options.date || (firstMessage?.timestamp ? formatTimestamp(firstMessage.timestamp) : ''),
    styles: getInlineStyles(),
    stats: generateStats(messages, annotations, durationMinutes),
    moments,
    phases: annotations.phases.phases.length > 0 ? annotations.phases.phases : null,
    phaseNav: annotations.phases.phases.length > 0 ? generatePhaseNav(annotations.phases) : null,
    goal: options.goal,
    outcome: options.outcome,
    model: options.model ? formatModelName(options.model) : undefined,
    totalMessages: messages.length
  };

  return summaryTemplate(data);
}

/**
 * Generate session pages (page-001.html, page-002.html, etc.)
 *
 * Creates the actual conversation pages with:
 * - Collapsible message blocks
 * - Highlighted key moments with annotations
 * - Phase indicators showing current task context
 * - Prev/Next navigation between pages
 *
 * Each page is a standalone HTML file with inline styles (for Gist compatibility)
 */
async function generateSessionPages(
  options: GeneratorOptions,
  messages: SessionMessage[],
  annotations: AnnotatorResult
): Promise<HTMLPage[]> {
  await loadTemplates();

  const messagesPerPage = options.messagesPerPage || 50;
  const pages = paginateMessages(messages, messagesPerPage);
  const htmlPages: HTMLPage[] = [];

  for (let i = 0; i < pages.length; i++) {
    const pageMessages = pages[i];
    const pageNumber = i + 1;
    const totalPages = pages.length;

    // Generate HTML for each message on this page
    const messagesHTML = pageMessages.map(msg =>
      generateMessageHTML(msg, annotations)
    );

    // Determine the current phase for this page (used for context badge)
    // A phase is a cohesive task like "setup", "debugging", "refactoring"
    const firstMsgIndex = pageMessages[0].index;
    const currentPhase = annotations.phases.phases.find(phase =>
      phase.messageIndices.includes(firstMsgIndex)
    );

    const data = {
      sessionTitle: options.sessionTitle,
      pageNumber,
      totalPages,
      currentPhase: currentPhase?.phaseName,
      styles: getInlineStyles(),
      messages: messagesHTML,
      // Navigation links (null if at boundary)
      prevPage: pageNumber > 1 ? `page-${String(pageNumber - 1).padStart(3, '0')}.html` : null,
      nextPage: pageNumber < totalPages ? `page-${String(pageNumber + 1).padStart(3, '0')}.html` : null
    };

    const filename = `page-${String(pageNumber).padStart(3, '0')}.html`;
    const content = sessionTemplate(data);

    htmlPages.push({ filename, content });
  }

  return htmlPages;
}

/**
 * Main generator function
 *
 * Orchestrates the entire HTML generation process:
 * 1. Calculates session duration from timestamps
 * 2. Generates index.html (summary page with timeline and stats)
 * 3. Generates paginated conversation pages (page-001.html, etc.)
 *
 * Output is designed for GitHub Gist:
 * - All styles are inline (no external CSS)
 * - Files are self-contained
 * - Summary page links to specific messages on paginated pages
 */
export async function generateAnnotatedHTML(
  messages: SessionMessage[],
  annotations: AnnotatorResult,
  options: GeneratorOptions
): Promise<HTMLOutput> {
  // Guard against empty messages array
  if (messages.length === 0) {
    throw new Error('Cannot generate HTML: no messages provided');
  }

  // Calculate session duration from first to last message timestamp
  const timestamps = messages
    .filter(m => m.timestamp)
    .map(m => new Date(m.timestamp!).getTime());

  const durationMinutes = timestamps.length > 1
    ? Math.round((Math.max(...timestamps) - Math.min(...timestamps)) / (1000 * 60))
    : 0;

  // Generate both summary and session pages in parallel
  const [summary, pages] = await Promise.all([
    generateSummaryPage(options, messages, annotations, durationMinutes),
    generateSessionPages(options, messages, annotations)
  ]);

  return {
    summary,   // index.html - landing page with key moments timeline
    pages      // page-NNN.html - actual conversation content
  };
}
