/**
 * Blog Summary Generator
 *
 * Main orchestrator that generates blog summaries in both Markdown and HTML formats
 */

import Handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  extractGoal,
  extractOutcome,
  extractKeyPrompts,
  extractCodeSnippets,
  extractMetadata,
  groupByPhase,
  type SessionMessage,
  type CodeSnippet,
  type SessionMetadata
} from './extractor';
import {
  truncateText,
  formatCodeSnippet,
  formatDate,
  generateDeepLink
} from './formatter';
import { generateASCIIDiagram, generateFlowchartASCII } from './diagram-builder';
import type { AnnotatorResult } from '../user-annotations';

// ============================================================================
// TYPES
// ============================================================================

export interface BlogSummaryOptions {
  sessionId: string;
  sessionTitle?: string;
  gistUrl?: string;
  messagesPerPage?: number;
  maxPromptsPerPhase?: number;
  maxCodePerPhase?: number;
}

export interface BlogSummaryOutput {
  markdown: string;
  html: string;
  metadata: SessionMetadata;
}

// ============================================================================
// HANDLEBARS HELPERS
// ============================================================================

Handlebars.registerHelper('eq', function(a: any, b: any) {
  return a === b;
});

Handlebars.registerHelper('truncate', function(text: string, maxLength: number) {
  return truncateText(text, maxLength);
});

Handlebars.registerHelper('limit', function(array: any[], max: number) {
  return array.slice(0, max);
});

Handlebars.registerHelper('formatDate', function(isoString: string) {
  return formatDate(isoString);
});

// ============================================================================
// TEMPLATE LOADING
// ============================================================================

const TEMPLATES_DIR = path.join(__dirname, 'templates');

let markdownTemplate: HandlebarsTemplateDelegate;
let htmlTemplate: HandlebarsTemplateDelegate;

async function loadTemplates() {
  if (typeof markdownTemplate !== 'undefined') return; // Already loaded

  const [markdown, html] = await Promise.all([
    fs.readFile(path.join(TEMPLATES_DIR, 'summary.md.hbs'), 'utf-8'),
    fs.readFile(path.join(TEMPLATES_DIR, 'summary.html.hbs'), 'utf-8')
  ]);

  markdownTemplate = Handlebars.compile(markdown);
  htmlTemplate = Handlebars.compile(html);
}

// ============================================================================
// MAIN GENERATOR
// ============================================================================

/**
 * Generate blog summary in both Markdown and HTML formats
 */
export async function generateBlogSummary(
  messages: SessionMessage[],
  annotations: AnnotatorResult,
  options: BlogSummaryOptions
): Promise<BlogSummaryOutput> {
  // Load templates
  await loadTemplates();

  // Extract data
  const goal = extractGoal(messages, annotations);
  const outcome = extractOutcome(messages, annotations);
  const keyPrompts = extractKeyPrompts(messages, annotations, options.maxPromptsPerPhase || 5);
  const codeSnippets = extractCodeSnippets(messages, options.maxCodePerPhase || 2);
  const metadata = extractMetadata(messages, annotations);

  // Generate ASCII diagrams
  const asciiDiagram = generateASCIIDiagram(annotations, {
    duration: metadata.duration,
    messageCount: metadata.messageCount
  });
  const flowchartDiagram = generateFlowchartASCII(annotations);

  // Group by phase
  const promptsByPhase = groupByPhase(keyPrompts, annotations.phases.phases);
  const codeByPhase = groupByPhase(codeSnippets, annotations.phases.phases);

  // Convert to plain objects for template (Handlebars can't iterate Map directly)
  const promptsByPhaseObj: Record<number, any[]> = {};
  promptsByPhase.forEach((prompts, phaseId) => {
    promptsByPhaseObj[phaseId] = prompts.map(prompt => ({
      ...prompt,
      deepLink: generateDeepLink(prompt.messageIndex, options.messagesPerPage || 50)
    }));
  });

  const codeByPhaseObj: Record<number, CodeSnippet[]> = {};
  codeByPhase.forEach((code, phaseId) => {
    codeByPhaseObj[phaseId] = code.map(snippet => ({
      ...snippet,
      code: formatCodeSnippet(snippet.code, snippet.language, 20)
    }));
  });

  // Prepare template data
  const templateData = {
    title: options.sessionTitle || `Session ${options.sessionId}`,
    sessionId: options.sessionId,
    goal,
    outcome,
    metadata,
    phases: annotations.phases.phases,
    promptsByPhase: promptsByPhaseObj,
    codeByPhase: codeByPhaseObj,
    asciiDiagram,
    flowchartDiagram,
    gistUrl: options.gistUrl
  };

  // Generate Markdown
  const markdown = markdownTemplate(templateData);

  // Generate HTML
  const html = htmlTemplate(templateData);

  return {
    markdown,
    html,
    metadata
  };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Generate Markdown summary only
 */
export async function generateMarkdownSummary(
  messages: SessionMessage[],
  annotations: AnnotatorResult,
  options: BlogSummaryOptions
): Promise<string> {
  const result = await generateBlogSummary(messages, annotations, options);
  return result.markdown;
}

/**
 * Generate HTML summary only
 */
export async function generateHTMLSummary(
  messages: SessionMessage[],
  annotations: AnnotatorResult,
  options: BlogSummaryOptions
): Promise<string> {
  const result = await generateBlogSummary(messages, annotations, options);
  return result.html;
}

/**
 * Write summary to files
 */
export async function writeBlogSummary(
  messages: SessionMessage[],
  annotations: AnnotatorResult,
  options: BlogSummaryOptions,
  outputDir: string
): Promise<{ markdownPath: string; htmlPath: string }> {
  const summary = await generateBlogSummary(messages, annotations, options);

  const markdownPath = path.join(outputDir, 'SUMMARY.md');
  const htmlPath = path.join(outputDir, 'summary.html');

  await Promise.all([
    fs.writeFile(markdownPath, summary.markdown, 'utf-8'),
    fs.writeFile(htmlPath, summary.html, 'utf-8')
  ]);

  return { markdownPath, htmlPath };
}
