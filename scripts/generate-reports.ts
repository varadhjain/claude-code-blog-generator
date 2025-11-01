#!/usr/bin/env ts-node
/**
 * Generate Session Analysis Reports
 *
 * Creates two versions of the report:
 * 1. Claims-first: Meta-analysis → Artifacts
 * 2. Evidence-first: Artifacts → Meta-analysis
 */

import * as fs from 'fs';
import * as path from 'path';
import { OpenAIClient, TokenTracker } from '../src/ai/client';
import { createSessionDigest } from '../src/analyzer/digest-builder';
import { metaAnalyze, MetaAnalysis } from '../src/prompts/meta-analysis';
import {
  extractCodeForPhases,
  selectInterestingArtifacts,
  CodeExtraction,
  Artifact,
} from '../src/analyzer/code-extractor';

const EXAMPLE_SESSION = path.join(
  __dirname,
  '../examples/blog-post-generator-transcript.jsonl'
);
const OUTPUT_DIR = path.join(__dirname, '../output');

// Load session
function loadSession(filepath: string): any[] {
  const lines = fs.readFileSync(filepath, 'utf-8').split('\n');
  return lines
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
    .filter((msg) => msg.type === 'user' || msg.type === 'assistant');
}

// Format artifact for display
function formatArtifact(artifact: Artifact, index: number): string {
  const lines: string[] = [];

  lines.push(`### ${index}. [${artifact.type.toUpperCase()}] ${artifact.context}`);
  lines.push(`**Source**: Message ${artifact.source_message}`);

  if (artifact.file_path) {
    lines.push(`**File**: \`${artifact.file_path}\``);
  }

  if (artifact.tool_name) {
    lines.push(`**Tool**: \`${artifact.tool_name}\``);
  }

  lines.push('\n**Content**:');
  lines.push('```' + (artifact.type === 'code' ? getLanguage(artifact.file_path) : ''));
  lines.push(artifact.content);
  lines.push('```\n');

  return lines.join('\n');
}

function getLanguage(filePath?: string): string {
  if (!filePath) return '';
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) return 'typescript';
  if (filePath.endsWith('.js') || filePath.endsWith('.jsx')) return 'javascript';
  if (filePath.endsWith('.md')) return 'markdown';
  if (filePath.endsWith('.json')) return 'json';
  if (filePath.endsWith('.sh')) return 'bash';
  return '';
}

// Generate claims-first report
function generateClaimsFirstReport(
  meta: MetaAnalysis,
  extractions: CodeExtraction[],
  interesting: Artifact[]
): string {
  const lines: string[] = [];

  lines.push('# Session Analysis Report');
  lines.push('## Version: Claims → Evidence\n');
  lines.push('---\n');

  // Section 1: Meta-Analysis (Claims)
  lines.push('## 1. Meta-Analysis Results\n');
  lines.push('_What the LLM identified from analyzing the session_\n');

  lines.push('### User Goal');
  lines.push(`**Primary Objective**: ${meta.user_goal.primary_objective}\n`);

  if (meta.user_goal.secondary_objectives && meta.user_goal.secondary_objectives.length > 0) {
    lines.push('**Secondary Objectives**:');
    meta.user_goal.secondary_objectives.forEach((obj) => lines.push(`- ${obj}`));
    lines.push('');
  }

  lines.push('### Recommended Blog Template');
  lines.push(`**Template**: \`${meta.recommended_template}\``);
  lines.push(`**Reasoning**: ${meta.template_reasoning}\n`);

  lines.push('### Identified Phases\n');
  meta.suggested_phases.forEach((phase, i) => {
    lines.push(`#### Phase ${i + 1}: ${phase.name}`);
    lines.push(`- **Messages**: ${phase.message_range[0]}-${phase.message_range[1]}`);
    lines.push(`- **Activity**: ${phase.primary_activity}`);
    lines.push(`- **Why Distinct**: ${phase.why_distinct}\n`);
  });

  lines.push('### Narrative Elements\n');
  lines.push('**Opening Hook**:');
  lines.push(`> ${meta.narrative_elements.opening_hook}\n`);

  lines.push('**Key Turning Points**:');
  meta.narrative_elements.key_turning_points.forEach((point) =>
    lines.push(`- ${point}`)
  );
  lines.push('');

  lines.push('**Lessons Learned Themes**:');
  meta.narrative_elements.lessons_learned_themes.forEach((theme) =>
    lines.push(`- ${theme}`)
  );
  lines.push('');

  lines.push('### Suggested Titles\n');
  meta.suggested_titles.forEach((title, i) => lines.push(`${i + 1}. ${title}`));
  lines.push('');

  lines.push('### Session Notes');
  lines.push(`- **Type**: ${meta.notes.session_type}`);
  lines.push(`- **Collaboration**: ${meta.notes.collaboration_detected ? 'Yes' : 'No'}`);
  lines.push(`- **Cost-Conscious**: ${meta.notes.cost_consciousness ? 'Yes' : 'No'}`);
  lines.push('\n**Notable Patterns**:');
  meta.notes.notable_patterns.forEach((pattern) => lines.push(`- ${pattern}`));
  lines.push('\n---\n');

  // Section 2: Real Artifacts (Evidence)
  lines.push('## 2. Extracted Real Artifacts\n');
  lines.push('_Actual code, errors, and commands from the session_\n');

  lines.push(`**Total Artifacts Extracted**: ${extractions.reduce((sum, e) => sum + e.artifacts.length, 0)}`);
  lines.push(`**Most Interesting**: ${interesting.length} selected\n`);

  interesting.forEach((artifact, i) => {
    lines.push(formatArtifact(artifact, i + 1));
  });

  lines.push('---\n');

  // Section 3: Verification
  lines.push('## 3. Verification Guide\n');
  lines.push('### How to Verify LLM Claims\n');
  lines.push('Each artifact above links back to its source message number. To verify:\n');
  lines.push('1. Find the message number (e.g., "Message 48")');
  lines.push('2. Open `examples/blog-post-generator-transcript.jsonl`');
  lines.push('3. Search for the message at that index');
  lines.push('4. Compare LLM\'s interpretation with actual content\n');

  lines.push('### Example Verification\n');
  lines.push('**LLM Claim**: "Phase 4 focused on documentation"');
  lines.push('**Evidence**: See artifacts from messages 43, 48, 54, 55');
  lines.push('**Result**: README, PLAN, LICENSE, .gitignore all created ✅\n');

  return lines.join('\n');
}

// Generate evidence-first report
function generateEvidenceFirstReport(
  meta: MetaAnalysis,
  extractions: CodeExtraction[],
  interesting: Artifact[]
): string {
  const lines: string[] = [];

  lines.push('# Session Analysis Report');
  lines.push('## Version: Evidence → Claims\n');
  lines.push('---\n');

  // Section 1: Real Artifacts (Evidence)
  lines.push('## 1. Extracted Real Artifacts\n');
  lines.push('_Actual code, errors, and commands from the session (ground truth)_\n');

  lines.push(`**Total Artifacts Extracted**: ${extractions.reduce((sum, e) => sum + e.artifacts.length, 0)}`);
  lines.push(`**Most Interesting**: ${interesting.length} selected\n`);

  interesting.forEach((artifact, i) => {
    lines.push(formatArtifact(artifact, i + 1));
  });

  lines.push('---\n');

  // Section 2: Meta-Analysis (Claims)
  lines.push('## 2. Meta-Analysis Results\n');
  lines.push('_What the LLM inferred from the artifacts above_\n');

  lines.push('### User Goal');
  lines.push(`**Primary Objective**: ${meta.user_goal.primary_objective}\n`);

  if (meta.user_goal.secondary_objectives && meta.user_goal.secondary_objectives.length > 0) {
    lines.push('**Secondary Objectives**:');
    meta.user_goal.secondary_objectives.forEach((obj) => lines.push(`- ${obj}`));
    lines.push('');
  }

  lines.push('### Recommended Blog Template');
  lines.push(`**Template**: \`${meta.recommended_template}\``);
  lines.push(`**Reasoning**: ${meta.template_reasoning}\n`);

  lines.push('### Identified Phases\n');
  meta.suggested_phases.forEach((phase, i) => {
    lines.push(`#### Phase ${i + 1}: ${phase.name}`);
    lines.push(`- **Messages**: ${phase.message_range[0]}-${phase.message_range[1]}`);
    lines.push(`- **Activity**: ${phase.primary_activity}`);
    lines.push(`- **Why Distinct**: ${phase.why_distinct}\n`);
  });

  lines.push('### Narrative Elements\n');
  lines.push('**Opening Hook**:');
  lines.push(`> ${meta.narrative_elements.opening_hook}\n`);

  lines.push('**Key Turning Points**:');
  meta.narrative_elements.key_turning_points.forEach((point) =>
    lines.push(`- ${point}`)
  );
  lines.push('');

  lines.push('**Lessons Learned Themes**:');
  meta.narrative_elements.lessons_learned_themes.forEach((theme) =>
    lines.push(`- ${theme}`)
  );
  lines.push('');

  lines.push('### Suggested Titles\n');
  meta.suggested_titles.forEach((title, i) => lines.push(`${i + 1}. ${title}`));
  lines.push('');

  lines.push('### Session Notes');
  lines.push(`- **Type**: ${meta.notes.session_type}`);
  lines.push(`- **Collaboration**: ${meta.notes.collaboration_detected ? 'Yes' : 'No'}`);
  lines.push(`- **Cost-Conscious**: ${meta.notes.cost_consciousness ? 'Yes' : 'No'}`);
  lines.push('\n**Notable Patterns**:');
  meta.notes.notable_patterns.forEach((pattern) => lines.push(`- ${pattern}`));
  lines.push('\n---\n');

  // Section 3: Verification
  lines.push('## 3. Verification Guide\n');
  lines.push('### How to Verify LLM Claims\n');
  lines.push('Compare the artifacts in Section 1 with the LLM interpretation in Section 2.\n');
  lines.push('Each artifact links to its source message:\n');
  lines.push('1. Find the message number (e.g., "Message 48")');
  lines.push('2. Open `examples/blog-post-generator-transcript.jsonl`');
  lines.push('3. Search for the message at that index');
  lines.push('4. Verify LLM\'s claims match the actual artifacts\n');

  lines.push('### Example Verification\n');
  lines.push('**Artifact**: README.md created in message 48');
  lines.push('**LLM Interpretation**: "Phase 4 focused on documentation"');
  lines.push('**Verification**: Check if other doc files (PLAN, LICENSE) also created in Phase 4 ✅\n');

  return lines.join('\n');
}

async function main() {
  console.log('🚀 Generating Session Analysis Reports');
  console.log('='.repeat(80));

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Load session
  console.log('📂 Loading session...');
  const messages = loadSession(EXAMPLE_SESSION);
  console.log(`✅ Loaded ${messages.length} messages\n`);

  // Run analysis
  console.log('🤖 Running meta-analysis...');
  const tokenTracker = new TokenTracker();
  const client = new OpenAIClient(tokenTracker);
  const digest = createSessionDigest(messages);
  const meta = await metaAnalyze(client, digest);
  console.log('✅ Meta-analysis complete\n');

  // Extract artifacts
  console.log('🔍 Extracting code artifacts...');
  const extractions = extractCodeForPhases(messages, meta, {
    maxCodeLength: 500,
    maxArtifactsPerSection: 5,
    includeTypes: ['code', 'error', 'command'],
  });
  const interesting = selectInterestingArtifacts(extractions, 5);
  console.log(`✅ Extracted ${interesting.length} interesting artifacts\n`);

  // Generate reports
  console.log('📝 Generating reports...\n');

  const claimsFirst = generateClaimsFirstReport(meta, extractions, interesting);
  const evidenceFirst = generateEvidenceFirstReport(meta, extractions, interesting);

  // Save reports
  const claimsFirstPath = path.join(OUTPUT_DIR, 'session-report-claims-first.md');
  const evidenceFirstPath = path.join(OUTPUT_DIR, 'session-report-evidence-first.md');
  const jsonPath = path.join(OUTPUT_DIR, 'extraction-data.json');

  fs.writeFileSync(claimsFirstPath, claimsFirst);
  fs.writeFileSync(evidenceFirstPath, evidenceFirst);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ meta, extractions, interesting }, null, 2)
  );

  console.log('✅ Reports generated:\n');
  console.log(`   Claims → Evidence: ${claimsFirstPath}`);
  console.log(`   Evidence → Claims: ${evidenceFirstPath}`);
  console.log(`   JSON Data: ${jsonPath}\n`);

  // Token usage
  console.log(tokenTracker.report());

  console.log('🎯 Done! Compare the two reports to see which ordering works better.');
}

main().catch((error) => {
  console.error('\n❌ Error:', error);
  if (error instanceof Error) {
    console.error(error.stack);
  }
  process.exit(1);
});
