/**
 * Blog post template types
 */

export type BlogTemplate =
  | 'mitchell'           // Personal narrative, problem → solution → lessons
  | 'tutorial'           // Step-by-step, reproducible instructions
  | 'archaeology'        // Analytical, investigative, data-driven
  | 'technical-deep-dive' // Code-heavy, focused on specific implementation
  | 'quick-win'          // Short, punchy posts about single insights
  | 'case-study';        // Problem → Investigation → Solution (debugging)

export interface TemplateInfo {
  id: BlogTemplate;
  name: string;
  description: string;
  bestFor: string[];
  characteristics: string[];
}

export const BLOG_TEMPLATES: Record<BlogTemplate, TemplateInfo> = {
  mitchell: {
    id: 'mitchell',
    name: 'Mitchell Hashimoto Style',
    description: 'Personal, reflective narrative with problem → solution → lessons structure',
    bestFor: ['greenfield projects', 'feature implementation', 'learning journeys'],
    characteristics: [
      'First-person narrative',
      'Reflective tone',
      'Focus on why and how, not just what',
      'Lessons learned section',
      'Personal anecdotes',
    ],
  },
  tutorial: {
    id: 'tutorial',
    name: 'Tutorial Style',
    description: 'Step-by-step, reproducible instructions for readers to follow',
    bestFor: ['project setup', 'configuration tasks', 'repeatable workflows'],
    characteristics: [
      'Second-person "you" voice',
      'Numbered steps',
      'Code snippets with explanations',
      'Prerequisites section',
      'Troubleshooting tips',
    ],
  },
  archaeology: {
    id: 'archaeology',
    name: 'Session Archaeology',
    description: 'Analytical, investigative approach treating the session log as primary source',
    bestFor: ['process analysis', 'tool usage patterns', 'meta-commentary on development'],
    characteristics: [
      'Third-person analytical voice',
      'Data-driven insights',
      'Statistics and metrics',
      'Pattern identification',
      'Treats session as artifact to study',
    ],
  },
  'technical-deep-dive': {
    id: 'technical-deep-dive',
    name: 'Technical Deep Dive',
    description: 'Code-heavy, focused exploration of specific implementation details',
    bestFor: ['algorithm implementation', 'architecture decisions', 'complex refactoring'],
    characteristics: [
      'Heavy code examples',
      'Technical depth',
      'Focus on one specific aspect',
      'Performance considerations',
      'Trade-off analysis',
    ],
  },
  'quick-win': {
    id: 'quick-win',
    name: 'Quick Win / TIL',
    description: 'Short, punchy post about a single insight or technique discovered',
    bestFor: ['short sessions', 'single tricks', 'aha moments', 'quick fixes'],
    characteristics: [
      'Concise (500-1000 words)',
      'One main insight',
      'Immediate value',
      'Easy to scan',
      'Focused takeaway',
    ],
  },
  'case-study': {
    id: 'case-study',
    name: 'Case Study / Post-Mortem',
    description: 'Problem → Investigation → Solution format for debugging sessions',
    bestFor: ['debugging', 'error investigation', 'problem-solving sessions'],
    characteristics: [
      'Problem statement upfront',
      'Investigation narrative',
      'Show failed attempts',
      'Solution explanation',
      'Prevention strategies',
    ],
  },
};
