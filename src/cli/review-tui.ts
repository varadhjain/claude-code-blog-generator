/**
 * ccblog review — interactive triage for extracted learnings.
 *
 * The privacy gate: every newly extracted learning starts as `share_status:
 * 'local'`. Local features (search, MCP, blog gen) ignore that field and use
 * everything. This TUI lets the human flip individual learnings to
 * `'reviewed'` (eligible for an outbound publisher) or `'private'` (never
 * leaves, but still searchable locally).
 *
 * No outbound transport is built yet. The contract: any future publisher
 * MUST refuse to read anything other than `'reviewed'`.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { select, confirm } from '@inquirer/prompts';
import { loadLearnings, updateLearning, type Learning } from '../extractor';

type Status = NonNullable<Learning['share_status']>;

interface ReviewOptions {
  all?: boolean;       // include already-reviewed/private items
}

const PENDING_MARKER = path.join(process.env.HOME!, '.ccblog', 'pending-review.json');

async function clearPendingMarker(reviewedIds: Set<string>): Promise<void> {
  let marker: { ids: string[] } = { ids: [] };
  try { marker = JSON.parse(await fs.readFile(PENDING_MARKER, 'utf-8')); } catch { return; }
  marker.ids = marker.ids.filter(id => !reviewedIds.has(id));
  await fs.writeFile(PENDING_MARKER, JSON.stringify(marker, null, 2));
}

function formatLearning(l: Learning, idx: number, total: number): string {
  const status = l.share_status ?? 'local';
  const statusBadge = status === 'reviewed' ? '✅ reviewed'
    : status === 'private' ? '🔒 private'
    : '📝 local-only';
  const redacted = l.redaction_summary
    ? `🔒 ${l.redaction_summary.count} item(s) redacted: ${l.redaction_summary.types.join(', ')}`
    : '⚠️  not redacted (extracted without --redact)';

  return [
    '',
    `╔═══════════════════════════════════════════════════════════╗`,
    `║  📚 Learning ${idx + 1} / ${total}     ${statusBadge.padEnd(40)}║`,
    `╚═══════════════════════════════════════════════════════════╝`,
    '',
    `  Type:     ${l.type}`,
    `  Date:     ${l.source_date}    Author: ${l.author ?? '?'}`,
    `  Tags:     ${l.tags.join(', ') || '(none)'}`,
    `  Files:    ${l.files_touched.join(', ') || '(none)'}`,
    `  Privacy:  ${redacted}`,
    '',
    `  Problem`,
    `  -------`,
    `  ${l.problem}`,
    '',
    `  Root cause`,
    `  ----------`,
    `  ${l.root_cause}`,
    '',
    `  Solution`,
    `  --------`,
    `  ${l.solution}`,
    l.what_didnt_work?.length ? `\n  What didn't work\n  ----------------\n  • ${l.what_didnt_work.join('\n  • ')}` : '',
    '',
    `  Trigger:  ${l.trigger_conditions}`,
    `  ID:       ${l.id}`,
    '',
  ].filter(Boolean).join('\n');
}

export async function runReview(opts: ReviewOptions = {}): Promise<void> {
  const all = await loadLearnings();
  const queue = opts.all
    ? all
    : all.filter(l => (l.share_status ?? 'local') === 'local');

  console.clear();
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🔍 ccblog review — triage learnings before sharing       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`  ${queue.length} ${opts.all ? 'total' : 'pending'} learning(s)`);
  console.log('');
  console.log('  This sets the SHARE GATE only. Local search, MCP queries, and');
  console.log('  blog generation always use every learning regardless of status.');
  console.log('  Status only governs what may leave this machine.');
  console.log('');

  if (queue.length === 0) {
    console.log('  Nothing to review. Re-run with --all to see already-decided items.');
    return;
  }

  const reviewedIds = new Set<string>();
  let i = 0;

  while (i < queue.length) {
    const l = queue[i];
    console.clear();
    console.log(formatLearning(l, i, queue.length));

    const action = await select<'share' | 'private' | 'edit-tags' | 'delete' | 'skip' | 'quit'>({
      message: 'Decision?',
      choices: [
        { name: '✅ Share-ready  (eligible for outbound publishing)', value: 'share' },
        { name: '🔒 Keep private (stays local only, never leaves)', value: 'private' },
        { name: '✏️  Edit tags    (then re-decide)', value: 'edit-tags' },
        { name: '🗑  Delete       (remove from disk)', value: 'delete' },
        { name: '⏭  Skip         (decide later)', value: 'skip' },
        { name: '🚪 Quit         (save progress and exit)', value: 'quit' },
      ],
      pageSize: 10,
    });

    if (action === 'quit') break;
    if (action === 'skip') { i++; continue; }

    if (action === 'edit-tags') {
      // Minimal editor: just toggle inclusion of common ones for now.
      const newTags = await editTags(l);
      await updateLearning(l.id, { tags: newTags });
      l.tags = newTags;
      continue; // re-prompt on the same item
    }

    if (action === 'delete') {
      const sure = await confirm({ message: `Delete "${l.problem.slice(0, 60)}…"? Cannot be undone.`, default: false });
      if (!sure) continue;
      const filepath = path.join(process.env.HOME!, '.ccblog', 'learnings', `${l.id}.json`);
      await fs.unlink(filepath);
      reviewedIds.add(l.id);
      i++;
      continue;
    }

    const status: Status = action === 'share' ? 'reviewed' : 'private';
    await updateLearning(l.id, {
      share_status: status,
      reviewed_at: new Date().toISOString(),
    });
    reviewedIds.add(l.id);
    i++;
  }

  await clearPendingMarker(reviewedIds);

  console.log('');
  console.log(`✅ Reviewed ${reviewedIds.size} learning(s).`);
  if (i < queue.length) console.log(`   ${queue.length - i} still pending — run again to continue.`);
}

async function editTags(l: Learning): Promise<string[]> {
  const { input } = await import('@inquirer/prompts');
  const next = await input({
    message: 'Tags (comma-separated):',
    default: l.tags.join(', '),
  });
  return next.split(',').map(t => t.trim()).filter(Boolean);
}

export async function pendingReviewCount(): Promise<number> {
  try {
    const marker = JSON.parse(await fs.readFile(PENDING_MARKER, 'utf-8')) as { ids: string[] };
    return marker.ids.length;
  } catch { return 0; }
}
