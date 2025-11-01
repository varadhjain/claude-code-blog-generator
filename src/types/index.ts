/**
 * Core type definitions for Claude Code Blog Generator
 */

// Session message types
export interface Message {
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  timestamp: string;
  type: 'user' | 'assistant' | 'file-history-snapshot' | 'summary';
  message: MessageContent;
  cwd: string;
  gitBranch?: string;
  version: string;
  isSidechain?: boolean;
  model?: string;
  requestId?: string;
}

export interface MessageContent {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
  model?: string;
  id?: string;
  usage?: TokenUsage;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking';
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string | unknown[];
}

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

// Phase detection types
export type PhaseType =
  | 'setup'
  | 'planning'
  | 'thinking'
  | 'coding'
  | 'testing'
  | 'debugging'
  | 'refinement'
  | 'decision_point';

export interface Phase {
  type: PhaseType;
  startMessageIndex: number;
  endMessageIndex: number;
  objective?: string;
  keyDecision?: string;
  summary?: string;
}

export interface DecisionPoint {
  messageIndex: number;
  decision: string;
  reasoning: string;
  previousApproach?: string;
  newApproach?: string;
}

// Context tracking types
export interface SessionContext {
  currentObjective: string;
  activeFiles: string[];
  approachTaken: string;
  keyDecisions: DecisionPoint[];
  openQuestions: string[];
}

// Generation types
export type GenerationMode = 'auto' | 'interactive';
export type TemplateType = 'blog' | 'thread' | 'tutorial' | 'postmortem';
export type RedactionLevel = 'aggressive' | 'balanced' | 'minimal';
export type OutputFormat = 'markdown' | 'html' | 'json';

export interface GenerationOptions {
  mode: GenerationMode;
  template: TemplateType;
  redactLevel: RedactionLevel;
  includeMetadata: boolean;
  outputFormat: OutputFormat;
}

export interface BlogPost {
  title: string;
  metadata: {
    date: string;
    duration: string;
    messageCount: number;
    model: string;
    totalTokens?: number;
  };
  sections: BlogSection[];
}

export interface BlogSection {
  type: 'problem' | 'phase' | 'decision' | 'lessons';
  title: string;
  content: string;
  codeBlocks?: CodeBlock[];
  messageRange?: [number, number];
}

export interface CodeBlock {
  language: string;
  code: string;
  caption?: string;
}

// CLI types
export interface CLIOptions {
  mode?: GenerationMode;
  output?: string;
  template?: TemplateType;
  redactLevel?: RedactionLevel;
  includeMetadata?: boolean;
  exportHtml?: boolean;
  interactivePii?: boolean;
  project?: string;
}
