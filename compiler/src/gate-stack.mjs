// The gate stack of decision 0158 item 1, run by `ship` before the pull request: the step's Check command, a conform pass,
// then a reviewer pass. CI, the last gate, runs in ship.mjs. Conform and reviewer are pluggable runners:
//   async ({ diff, brief, decisions }) => ({ ok: boolean, summary: string, flagged?: boolean })
// The reviewer pass runs on a fresh context: its input is exactly the diff, the brief and the decisions, never the author's
// transcript, and it gets no project path. The result of each gate goes to the run record (name and status only).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { noteGate } from './runs/record.mjs';

const CAP = 20_000;
const cap = (s) => (s.length > CAP ? `${s.slice(0, CAP)}\n[truncated]` : s);

// The change against the base: tracked changes (committed or not) plus the untracked files as additions.
export function changeDiff(project, base, run) {
  const git = (...a) => run('git', a, { cwd: project });
  const parts = [git('diff', `origin/${base}`).out];
  for (const f of git('ls-files', '-o', '--exclude-standard').out.split('\n').filter(Boolean)) {
    let text;
    try {
      text = readFileSync(path.join(project, f), 'utf8');
    } catch {
      continue;
    }
    parts.push(`diff --git a/${f} b/${f}\nnew file\n--- /dev/null\n+++ b/${f}\n${text.split('\n').map((l) => `+${l}`).join('\n')}\n`);
  }
  return parts.join('');
}

// The decisions and guardrails among the change's refs and the files it touches, as { path, text }.
export function decisionsFor(project, refs, diff = '') {
  const touched = [...diff.matchAll(/^\+\+\+ b\/(docs\/(?:decisions|guardrails)\/[^\n]+\.md)$/gm)].map((m) => m[1]);
  return [...new Set([...refs, ...touched])]
    .filter((r) => /^docs\/(decisions|guardrails)\//.test(r))
    .flatMap((r) => {
      try {
        return [{ path: r, text: cap(readFileSync(path.join(project, r), 'utf8')) }];
      } catch {
        return [];
      }
    });
}

const sh = (project, run, command) => run('sh', ['-c', command], { cwd: project });

// `check`, `conform` and `review` may each be a value, or `{ skip: '<reason>' }` to record why the gate did not run.
// Runs the configured gates in order; a failing one is recorded and throws. Returns { gates: [{gate, status, summary}], flagged }.
export async function runGateStack(project, { base, why, refs, check, checkLabel, conform, review, verb = 'ship' }, run, log, ShipError) {
  const gates = [];
  let flagged = false;
  const record = (gate, status, summary) => {
    gates.push({ gate, status, summary });
    try {
      noteGate(project, gate, status);
    } catch {
      // the run record is best effort; the result is still returned and logged
    }
    log(gate, status === 'pass' && summary ? summary : `${status}${summary ? `: ${summary}` : ''}`);
  };
  const fail = (gate, summary) => {
    record(gate, 'fail', summary);
    throw new ShipError(gate === 'review' ? `${verb}: review found problems: ${summary}` : `${verb}: ${gate} gate failed: ${summary}`);
  };

  if (check && typeof check === 'string') {
    const r = sh(project, run, check);
    if (r.code !== 0) fail('check', `${checkLabel ? `${checkLabel} ` : ''}\`${check}\` exited ${r.code}: ${(r.err || r.out).trim().split('\n').slice(-2).join(' | ')}`);
    record('check', 'pass', `${checkLabel ? `${checkLabel} ` : ''}\`${check}\``);
  } else record('check', 'skipped', check?.skip ?? 'no step check given');

  let input = null;
  const inputOnce = () => {
    if (!input) {
      const diff = changeDiff(project, base, run);
      input = { diff: cap(diff), brief: why, decisions: decisionsFor(project, refs, diff) };
    }
    return input;
  };
  for (const [gate, runner] of [['conform', conform], ['review', review]]) {
    if (!runner || typeof runner !== 'function') {
      record(gate, 'skipped', runner?.skip ?? 'no runner configured');
      continue;
    }
    // A fresh object per pass holding only the three inputs.
    const { diff, brief, decisions } = inputOnce();
    const r = await runner({ diff, brief, decisions: decisions.map((d) => ({ ...d })) });
    if (!r?.ok) fail(gate, r?.summary || 'failed');
    if (gate === 'review' && r.flagged) flagged = true;
    record(gate, 'pass', r.summary);
  }
  return { gates, flagged };
}
