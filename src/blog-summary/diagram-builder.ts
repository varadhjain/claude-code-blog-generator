/**
 * Mermaid Diagram Builder for Session Visualization
 *
 * Generates flowchart diagrams showing session flow, phases, and key decisions
 */

import type { AnnotatorResult } from '../user-annotations';
import type { SessionMessage } from './extractor';

// ============================================================================
// TYPES
// ============================================================================

interface DiagramNode {
  id: string;
  label: string;
  type: 'start' | 'phase' | 'prompt' | 'decision' | 'end';
  color?: 'green' | 'yellow' | 'red';
}

interface DiagramEdge {
  from: string;
  to: string;
  label?: string;
}

// ============================================================================
// MERMAID GENERATION
// ============================================================================

/**
 * Generate a Mermaid flowchart showing session flow
 */
export function generateMermaidDiagram(
  _messages: SessionMessage[],
  annotations: AnnotatorResult
): string {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];

  // Add start node
  nodes.push({
    id: 'START',
    label: 'Session Start',
    type: 'start'
  });

  let previousNodeId = 'START';

  // Process each phase
  annotations.phases.phases.forEach((phase, phaseIndex) => {
    const phaseId = `PHASE${phaseIndex + 1}`;

    // Add phase node
    nodes.push({
      id: phaseId,
      label: truncateLabel(phase.phaseName, 40),
      type: 'phase'
    });

    // Connect from previous node
    edges.push({
      from: previousNodeId,
      to: phaseId
    });

    // Find key prompts in this phase (green and red only for diagram clarity)
    const phaseAnnotations = annotations.annotations.filter(
      ann => phase.messageIndices.includes(ann.messageIndex) &&
             (ann.color === 'green' || ann.color === 'red')
    );

    // Add up to 2 key prompts per phase
    const keyPrompts = phaseAnnotations.slice(0, 2);
    let lastPromptId = phaseId;

    keyPrompts.forEach((prompt, promptIndex) => {
      const promptId = `${phaseId}_P${promptIndex + 1}`;

      nodes.push({
        id: promptId,
        label: truncateLabel(prompt.annotation, 30),
        type: 'prompt',
        color: prompt.color
      });

      edges.push({
        from: lastPromptId,
        to: promptId
      });

      lastPromptId = promptId;
    });

    previousNodeId = keyPrompts.length > 0 ? `${phaseId}_P${keyPrompts.length}` : phaseId;
  });

  // Add end node
  nodes.push({
    id: 'END',
    label: 'Session Complete',
    type: 'end'
  });

  edges.push({
    from: previousNodeId,
    to: 'END'
  });

  // Build Mermaid syntax
  return buildMermaidSyntax(nodes, edges);
}

/**
 * Build Mermaid flowchart syntax from nodes and edges
 */
function buildMermaidSyntax(nodes: DiagramNode[], edges: DiagramEdge[]): string {
  const lines: string[] = [];

  lines.push('graph TD');
  lines.push('');

  // Add node definitions
  nodes.forEach(node => {
    const nodeShape = getNodeShape(node.type);
    const label = sanitizeMermaidLabel(node.label);
    lines.push(`    ${node.id}${nodeShape[0]}${label}${nodeShape[1]}`);
  });

  lines.push('');

  // Add edges
  edges.forEach(edge => {
    const arrow = edge.label ? `-->|${edge.label}|` : '-->';
    lines.push(`    ${edge.from} ${arrow} ${edge.to}`);
  });

  lines.push('');

  // Add styling
  lines.push('    %% Styling');
  nodes.forEach(node => {
    if (node.type === 'start') {
      lines.push(`    style ${node.id} fill:#e1f5e1,stroke:#2ea043`);
    } else if (node.type === 'end') {
      lines.push(`    style ${node.id} fill:#d4edda,stroke:#28a745`);
    } else if (node.type === 'phase') {
      lines.push(`    style ${node.id} fill:#ddf4ff,stroke:#0969da`);
    } else if (node.color === 'green') {
      lines.push(`    style ${node.id} fill:#dafbe1,stroke:#1a7f37`);
    } else if (node.color === 'red') {
      lines.push(`    style ${node.id} fill:#ffebe9,stroke:#cf222e`);
    } else if (node.color === 'yellow') {
      lines.push(`    style ${node.id} fill:#fff8c5,stroke:#bf8700`);
    }
  });

  return lines.join('\n');
}

/**
 * Get node shape based on type
 */
function getNodeShape(type: string): [string, string] {
  switch (type) {
    case 'start':
    case 'end':
      return ['([', '])'];  // Stadium shape
    case 'phase':
      return ['[', ']'];     // Rectangle
    case 'decision':
      return ['{', '}'];     // Diamond
    case 'prompt':
    default:
      return ['[', ']'];     // Rectangle
  }
}

/**
 * Sanitize label for Mermaid (escape special characters)
 */
function sanitizeMermaidLabel(label: string): string {
  return label
    .replace(/"/g, '#quot;')
    .replace(/\[/g, '#91;')
    .replace(/\]/g, '#93;')
    .replace(/\(/g, '#40;')
    .replace(/\)/g, '#41;')
    .replace(/\{/g, '#123;')
    .replace(/\}/g, '#125;');
}

/**
 * Truncate label to max length
 */
function truncateLabel(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

// ============================================================================
// ALTERNATIVE: COMPACT DIAGRAM
// ============================================================================

/**
 * Generate a compact Mermaid diagram (phases only, no individual prompts)
 */
export function generateCompactMermaidDiagram(
  annotations: AnnotatorResult
): string {
  const lines: string[] = [];

  lines.push('graph LR');
  lines.push('');
  lines.push('    START([Start])');

  annotations.phases.phases.forEach((phase, index) => {
    const phaseId = `P${index + 1}`;
    const label = truncateLabel(phase.phaseName, 30);
    lines.push(`    ${phaseId}[${sanitizeMermaidLabel(label)}]`);
  });

  lines.push('    END([Complete])');
  lines.push('');

  // Connections
  let prev = 'START';
  annotations.phases.phases.forEach((_, index) => {
    const phaseId = `P${index + 1}`;
    lines.push(`    ${prev} --> ${phaseId}`);
    prev = phaseId;
  });
  lines.push(`    ${prev} --> END`);

  lines.push('');
  lines.push('    %% Styling');
  lines.push('    style START fill:#e1f5e1,stroke:#2ea043');
  lines.push('    style END fill:#d4edda,stroke:#28a745');

  annotations.phases.phases.forEach((_, index) => {
    lines.push(`    style P${index + 1} fill:#ddf4ff,stroke:#0969da`);
  });

  return lines.join('\n');
}
