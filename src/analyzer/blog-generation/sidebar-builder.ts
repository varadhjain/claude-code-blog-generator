/**
 * Sidebar Builder
 *
 * Combines all narrative outputs into the final sidebar format.
 * This is what goes alongside the formatted transcript in the blog post.
 */

import { OpenAIClient } from '../../ai/client';
import { SessionDigest } from './digest-builder';
import { ApproachNarrative, buildApproachNarrative } from '../../prompts/blog-generation/approach-narrative';
import { ProblemsEncountered, extractProblems } from '../../prompts/blog-generation/problem-extraction';
import {
  SuccessesIdentified,
  extractSuccesses,
} from '../../prompts/blog-generation/success-extraction';
import {
  LearningsExtracted,
  extractLearnings,
} from '../../prompts/blog-generation/structured-learning';
import { InterestingMoments, findInterestingMoments } from '../../prompts/blog-generation/interesting-moments';
import { TitleOptions, brainstormTitles } from '../../prompts/blog-generation/title-brainstorm';

export interface SidebarContent {
  session_goal: string;
  approach: ApproachNarrative;
  problems_encountered: ProblemsEncountered;
  what_went_well: SuccessesIdentified;
  learnings: LearningsExtracted;
  interesting_moments: InterestingMoments;
  potential_titles: TitleOptions;
  key_phases: Array<{
    name: string;
    message_range: [number, number];
    summary: string;
  }>;
}

/**
 * Build complete sidebar content from session digest
 */
export async function buildSidebar(
  client: OpenAIClient,
  digest: SessionDigest
): Promise<SidebarContent> {
  // Run all extractions in parallel for efficiency
  const [approach, problems, successes, learnings, interestingMoments] =
    await Promise.all([
      buildApproachNarrative(client, digest),
      extractProblems(client, digest),
      extractSuccesses(client, digest),
      extractLearnings(client, digest),
      findInterestingMoments(client, digest),
    ]);

  // Generate title options based on interesting moments
  const titleOptions = await brainstormTitles(
    client,
    digest.session_opening.initial_request,
    interestingMoments.moments
  );

  // Extract key phases from digest
  const keyPhases = digest.phase_transitions.map((transition, i, arr) => {
    const start = i === 0 ? 1 : transition.message_index;
    const end = i < arr.length - 1 ? arr[i + 1].message_index : digest.session_stats.total_messages;

    return {
      name: `Phase ${i + 1}`,
      message_range: [start, end] as [number, number],
      summary: transition.indicator,
    };
  });

  return {
    session_goal: digest.session_opening.initial_request,
    approach,
    problems_encountered: problems,
    what_went_well: successes,
    learnings,
    interesting_moments: interestingMoments,
    potential_titles: titleOptions,
    key_phases: keyPhases,
  };
}

/**
 * Format sidebar content as markdown
 */
export function formatSidebarMarkdown(sidebar: SidebarContent): string {
  const lines: string[] = [];

  lines.push('# Session Sidebar\n');
  lines.push('---\n');

  // Session Goal
  lines.push('## 📋 Session Goal\n');
  lines.push(sidebar.session_goal);
  lines.push('\n---\n');

  // Approach
  lines.push('## 🎯 Approach\n');
  lines.push(`**Strategy**: ${sidebar.approach.high_level_strategy}\n`);
  lines.push('**Characteristics**:');
  sidebar.approach.key_characteristics.forEach((c) => lines.push(`- ${c}`));
  lines.push(`\n**Workflow**: ${sidebar.approach.workflow_pattern}\n`);

  if (sidebar.approach.notable_decisions.length > 0) {
    lines.push('**Key Decisions**:');
    sidebar.approach.notable_decisions.forEach((d) => {
      lines.push(`- **${d.what}** (msg ${d.when_message})`);
      lines.push(`  - Why: ${d.why}`);
      lines.push(`  - Impact: ${d.impact}`);
    });
    lines.push('');
  }

  if (sidebar.approach.evolution) {
    lines.push(`**Evolution**: ${sidebar.approach.evolution}`);
  }
  lines.push('\n---\n');

  // Problems Encountered
  lines.push('## ⚠️ Problems Encountered\n');
  lines.push(`_${sidebar.problems_encountered.summary}_\n`);

  if (sidebar.problems_encountered.problems.length > 0) {
    sidebar.problems_encountered.problems.forEach((p, i) => {
      lines.push(`### ${i + 1}. ${p.title}`);
      lines.push(`**What**: ${p.description}`);
      lines.push(`**Symptom**: ${p.symptom}`);
      lines.push(`**Messages**: ${p.message_range[0]}-${p.message_range[1]} (${p.time_spent_messages} messages)\n`);

      if (p.attempts.length > 0) {
        lines.push('**Attempts**:');
        p.attempts.forEach((a, j) => {
          lines.push(`${j + 1}. ${a.approach} → ${a.outcome} (msg ${a.message_index})`);
        });
        lines.push('');
      }

      if (p.resolution) {
        lines.push(`**Resolution**: ${p.resolution}\n`);
      }

      if (p.learnings.length > 0) {
        lines.push('**Learnings**:');
        p.learnings.forEach((l) => lines.push(`- ${l}`));
        lines.push('');
      }
    });
  } else {
    lines.push('_No significant problems encountered_\n');
  }
  lines.push('---\n');

  // What Went Well
  lines.push('## ✅ What Went Well\n');
  lines.push(`_${sidebar.what_went_well.summary}_\n`);
  lines.push(`**Overall Velocity**: ${sidebar.what_went_well.overall_velocity}\n`);

  sidebar.what_went_well.successes.forEach((s, i) => {
    lines.push(`### ${i + 1}. ${s.what}`);
    lines.push(`**Category**: ${s.category}`);
    lines.push(`**Why Noteworthy**: ${s.why_noteworthy}`);
    lines.push(`**Evidence**: ${s.evidence}`);
    lines.push(`**Messages**: ${s.message_range[0]}-${s.message_range[1]}\n`);
  });
  lines.push('---\n');

  // Learnings
  lines.push('## 💡 Learnings\n');
  lines.push(`_${sidebar.learnings.summary}_\n`);
  lines.push(`**Primary Lesson**: ${sidebar.learnings.primary_lesson}\n`);

  sidebar.learnings.learnings.forEach((l, i) => {
    lines.push(`### ${i + 1}. ${l.insight}`);
    lines.push(`**Category**: ${l.category}`);
    lines.push(`**Confidence**: ${l.confidence}`);
    lines.push(`**Actionable**: ${l.actionable ? 'Yes' : 'No'}`);
    lines.push(`**Applies to**: ${l.applies_to.join(', ')}`);
    lines.push(
      `**Evidence**: ${l.supporting_evidence.description} (messages: ${l.supporting_evidence.message_indices.join(', ')})\n`
    );
  });
  lines.push('---\n');

  // Interesting Moments
  lines.push('## ✨ Interesting Moments\n');
  lines.push(`_${sidebar.interesting_moments.summary}_\n`);

  sidebar.interesting_moments.moments.forEach((m, i) => {
    lines.push(`### ${i + 1}. ${m.title}`);
    lines.push(`${m.description}`);
    lines.push(`**Why interesting**: ${m.why_interesting}`);
    if (m.message_range) {
      lines.push(`**Messages**: ${m.message_range[0]}-${m.message_range[1]}`);
    }
    lines.push('');
  });
  lines.push('---\n');

  // Potential Titles
  lines.push('## 📝 Potential Blog Titles\n');
  sidebar.potential_titles.titles.forEach((t, i) => {
    lines.push(`${i + 1}. **"${t.title}"**`);
    lines.push(`   - Style: ${t.style}`);
    lines.push(`   - Appeal: ${t.appeal}\n`);
  });
  lines.push('---\n');

  // Key Phases
  lines.push('## 🔄 Key Phases\n');
  sidebar.key_phases.forEach((p, i) => {
    lines.push(`${i + 1}. **${p.name}** (messages ${p.message_range[0]}-${p.message_range[1]})`);
    lines.push(`   ${p.summary}\n`);
  });

  return lines.join('\n');
}
