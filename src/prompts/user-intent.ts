/**
 * User Intent
 *
 * Captures what story the user wants to tell from their session.
 * This steers all subsequent narrative extraction.
 */

import { SessionDigest } from '../analyzer/digest-builder';

export type SessionAngle =
  | 'one-shot-success'
  | 'debugging-struggle'
  | 'workflow-patterns'
  | 'speed-efficiency'
  | 'learning-new-tech'
  | 'custom';

export interface UserIntent {
  angle: SessionAngle;
  custom_description?: string; // If angle is 'custom'
  focus_areas: string[]; // What aspects to emphasize
  target_audience: string; // Who is this for?
}

export const ANGLE_DESCRIPTIONS: Record<SessionAngle, string> = {
  'one-shot-success': 'Single message → complete solution (show how Claude Code nailed it)',
  'debugging-struggle': 'Wrestling with errors and bugs (show the problem-solving journey)',
  'workflow-patterns': 'How I use Claude Code effectively (show techniques and patterns)',
  'speed-efficiency': 'Built X in Y minutes (show velocity and productivity)',
  'learning-new-tech': 'Learning a new technology with Claude Code (show exploration process)',
  'custom': 'Your own angle (describe what makes this session interesting)',
};

/**
 * Infer likely angle from session digest
 * (Used as suggestion, user can override)
 */
export function suggestAngle(digest: SessionDigest): SessionAngle {
  const stats = digest.session_stats;
  const tools = digest.tool_summary;

  // One-shot: Very short session with high output
  if (stats.total_messages < 20 && digest.files_created.length > 5) {
    return 'one-shot-success';
  }

  // Debugging: Lots of edits, bash runs, errors
  const editCount = tools.find((t) => t.tool_name === 'Edit')?.count || 0;
  const bashCount = tools.find((t) => t.tool_name === 'Bash')?.count || 0;
  const hasErrors = digest.phase_transitions.some((t) =>
    t.indicator.toLowerCase().includes('error')
  );
  if (editCount > 10 || (bashCount > 8 && hasErrors)) {
    return 'debugging-struggle';
  }

  // Speed/efficiency: High file creation rate
  const filesPerMessage = digest.files_created.length / stats.total_messages;
  if (filesPerMessage > 0.15 && stats.duration_estimate_minutes < 45) {
    return 'speed-efficiency';
  }

  // Workflow patterns: Lots of planning, questions, structured tools
  const todoCount = tools.find((t) => t.tool_name === 'TodoWrite')?.count || 0;
  const askCount = tools.find((t) => t.tool_name === 'AskUserQuestion')?.count || 0;
  if (todoCount > 5 || askCount > 3) {
    return 'workflow-patterns';
  }

  // Learning: Lots of reads, searches, exploration
  const readCount = tools.find((t) => t.tool_name === 'Read')?.count || 0;
  const grepCount = tools.find((t) => t.tool_name === 'Grep')?.count || 0;
  const searchCount = tools.find((t) => t.tool_name === 'WebSearch')?.count || 0;
  if (readCount > 15 || grepCount > 10 || searchCount > 2) {
    return 'learning-new-tech';
  }

  // Default: workflow patterns
  return 'workflow-patterns';
}

/**
 * Build focus areas based on angle
 */
export function getFocusAreas(angle: SessionAngle, digest: SessionDigest): string[] {
  switch (angle) {
    case 'one-shot-success':
      return [
        'The initial request and how clear it was',
        'What Claude Code understood immediately',
        'The final result quality',
      ];

    case 'debugging-struggle':
      return [
        'What went wrong and why',
        'How you and Claude Code debugged together',
        'What you learned from the struggle',
      ];

    case 'workflow-patterns':
      return [
        'Your planning and task management approach',
        'How you structured the conversation',
        'Reusable techniques you discovered',
      ];

    case 'speed-efficiency':
      return [
        'What enabled the fast implementation',
        'Tools and shortcuts used',
        'Final output and time saved',
      ];

    case 'learning-new-tech':
      return [
        'What you were trying to learn',
        'How Claude Code helped you explore',
        'Key concepts you discovered',
      ];

    case 'custom':
      return ['User-defined focus'];
  }
}
