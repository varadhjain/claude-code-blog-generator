/**
 * `ccblog skills-report` — read the telemetry jsonl and produce a usage
 * digest. Tells you which of your skills are dead.
 *
 * Output format: ranked by call count, with last-used date. Skills with
 * zero calls in the window are listed separately (the "dead skills"
 * section), so the user can decide whether to delete them.
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_PATH = path.join(process.env.HOME!, '.ccblog', 'telemetry', 'skills.jsonl');

interface TelemetryRecord {
  ts: string;
  session_id: string | null;
  project_path: string | null;
  tool_name: string;
  skill_name: string;
  args_summary: string;
}

interface SkillStat {
  skill: string;
  count: number;
  lastUsed: string;
  projects: Set<string>;
}

export interface SkillsReportOptions {
  sinceMs?: number;          // default: all time
  knownSkills?: string[];    // if provided, dead-skills section lists these minus seen
}

export function runSkillsReport(opts: SkillsReportOptions = {}): { stdout: string; sawData: boolean } {
  if (!fs.existsSync(LOG_PATH)) {
    return {
      sawData: false,
      stdout:
        'No telemetry yet. Wire the hook into ~/.claude/settings.json:\n\n' +
        '  {\n' +
        '    "hooks": {\n' +
        '      "PostToolUse": [\n' +
        '        { "matcher": "Skill", "hooks": [{ "type": "command", "command": "ccblog telemetry-hook" }] }\n' +
        '      ]\n' +
        '    }\n' +
        '  }\n\n' +
        'Then use Claude Code normally for a few days and re-run this command.\n',
    };
  }

  const sinceMs = opts.sinceMs ?? 0;
  const stats = new Map<string, SkillStat>();

  const content = fs.readFileSync(LOG_PATH, 'utf-8');
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    let r: TelemetryRecord;
    try { r = JSON.parse(line); } catch { continue; }
    const ts = Date.parse(r.ts);
    if (Number.isNaN(ts) || ts < sinceMs) continue;
    if (!r.skill_name) continue;

    const existing = stats.get(r.skill_name) ?? {
      skill: r.skill_name, count: 0, lastUsed: r.ts, projects: new Set<string>(),
    };
    existing.count += 1;
    if (r.ts > existing.lastUsed) existing.lastUsed = r.ts;
    if (r.project_path) existing.projects.add(basename(r.project_path));
    stats.set(r.skill_name, existing);
  }

  if (stats.size === 0) {
    return { sawData: false, stdout: 'No skill invocations in window.\n' };
  }

  const ranked = Array.from(stats.values()).sort((a, b) => b.count - a.count);

  const lines: string[] = [];
  const windowLabel = sinceMs > 0 ? `since ${new Date(sinceMs).toISOString().slice(0, 10)}` : 'all time';
  lines.push(`# Skill usage report (${windowLabel})`);
  lines.push('');
  lines.push(`${ranked.length} distinct skill(s) invoked. Total invocations: ${ranked.reduce((s, x) => s + x.count, 0)}.`);
  lines.push('');
  lines.push('| Skill | Count | Last used | Projects |');
  lines.push('|-------|------:|-----------|----------|');
  for (const r of ranked) {
    const last = r.lastUsed.slice(0, 10);
    const projects = Array.from(r.projects).join(', ') || '—';
    lines.push(`| ${r.skill} | ${r.count} | ${last} | ${projects} |`);
  }
  lines.push('');

  if (opts.knownSkills && opts.knownSkills.length > 0) {
    const seen = new Set(ranked.map(r => r.skill));
    const dead = opts.knownSkills.filter(s => !seen.has(s));
    if (dead.length > 0) {
      lines.push('## Dead skills (declared but never invoked in window)');
      lines.push('');
      for (const d of dead) lines.push(`- ${d}`);
      lines.push('');
      lines.push('Consider deleting these to lighten context.');
    }
  }

  return { sawData: true, stdout: lines.join('\n') + '\n' };
}

function basename(p: string): string {
  const parts = p.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? p;
}
