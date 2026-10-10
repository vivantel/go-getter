import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { planApply, writeApply, diffApply } from '../src/apply.mjs';
import { planRemove, applyRemove } from '../src/remove.mjs';
import { runTier3, inStage } from '../src/enforce.mjs';
import { guardrailProblems } from '../src/checks/guardrails.mjs';
import { HOSTS } from '../src/capabilities.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');

function guardrail(id, entries, body = 'Do it.') {
  const lines = entries
    .map((e) => `    - tier: ${e.tier}\n      check: "${e.check ?? id}"\n      run: "${e.run}"${e.stages ? `\n      stages: [${e.stages.join(', ')}]` : ''}`)
    .join('\n');
  return `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-10\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n${lines}\n---\n\n## Guardrail\n\n${body}\n`;
}
// A check that fails when `.flag-<name>` exists, so each entry can be made to fail on its own.
const flagged = (name) => ({ tier: 3, run: `test ! -e .flag-${name}` });

function project(extra = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-stages-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  const files = {
    'default-rule': guardrail('default-rule', [flagged('default')]),
    'commit-rule': guardrail('commit-rule', [{ ...flagged('commit'), stages: ['pre-commit'] }]),
    'both-rule': guardrail('both-rule', [{ ...flagged('both'), stages: ['pre-commit', 'pre-push'] }]),
    ...extra,
  };
  for (const [id, text] of Object.entries(files)) writeFileSync(path.join(dir, 'docs/guardrails', `${id}.md`), text);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}
const flag = (dir, ...names) => names.forEach((n) => writeFileSync(path.join(dir, `.flag-${n}`), ''));
const failed = async (dir, stage) => (await runTier3(dir, { stage })).filter((r) => !r.ok).map((r) => r.guardrail).sort();
const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

test('an entry without stages runs before a push; with stages it runs where it lists; ci and no stage run everything', async () => {
  const dir = project();
  try {
    flag(dir, 'default', 'commit', 'both');
    assert.deepEqual(await failed(dir, 'pre-commit'), ['both-rule', 'commit-rule']);
    assert.deepEqual(await failed(dir, 'pre-push'), ['both-rule', 'default-rule']);
    assert.deepEqual(await failed(dir, 'ci'), ['both-rule', 'commit-rule', 'default-rule']);
    assert.deepEqual(await failed(dir, undefined), ['both-rule', 'commit-rule', 'default-rule']);
    assert.equal(inStage({}, 'pre-commit'), false);
    assert.equal(inStage({}, 'pre-push'), true);
  } finally {
    cleanup(dir);
  }
});

test('go-getter check --stage filters, and an unknown stage is a usage error', () => {
  const dir = project();
  const run = (...a) => spawnSync(process.execPath, [cli, 'check', '--project', dir, ...a], { encoding: 'utf8' });
  try {
    flag(dir, 'commit');
    assert.equal(run('--stage', 'pre-commit').status, 1);
    assert.match(run('--stage', 'pre-commit').stdout, /FAIL commit-rule/);
    assert.equal(run('--stage', 'pre-push').status, 0, 'the pre-commit entry does not run before a push');
    assert.equal(run('--stage', 'ci').status, 1);
    const bad = run('--stage', 'nonsense');
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /usage/);
  } finally {
    cleanup(dir);
  }
});

test('stages are for tier 3 and list pre-commit and/or pre-push', () => {
  const g = (entry, body = 'Advisory.') => [{ file: 'g.md', body, data: { 'go-getter': { enforcement: [entry] } } }];
  const ok = { tier: 3, check: 'c', run: 'builtin:x', stages: ['pre-commit'] };
  assert.deepEqual(guardrailProblems(g(ok)), []);
  assert.match(guardrailProblems(g({ ...ok, stages: ['pre-merge'] }))[0], /stages is for tier 3/);
  assert.match(guardrailProblems(g({ ...ok, stages: [] }))[0], /stages is for tier 3/);
  assert.match(guardrailProblems(g({ ...ok, stages: 'pre-commit' }))[0], /stages is for tier 3/);
  assert.match(guardrailProblems(g({ tier: 2, check: 'c', run: 'builtin:x', stages: ['pre-commit'] }))[0], /stages is for tier 3/);
});

// One host: with no tier-2 guardrail a second apply plans an empty `hooks` key in .gemini/settings.json (a follow-up in the v0.2 plan).
test('apply writes the pre-commit hook only when an entry lists it, and it is idempotent and executable', () => {
  const without = project({ 'commit-rule': guardrail('commit-rule', [flagged('commit')]), 'both-rule': guardrail('both-rule', [flagged('both')]) });
  const withHook = project();
  try {
    writeApply(without, planApply(without, { hosts: ['claude-code'] }));
    assert.ok(existsSync(path.join(without, '.githooks/pre-push')));
    assert.equal(existsSync(path.join(without, '.githooks/pre-commit')), false);

    writeApply(withHook, planApply(withHook, { hosts: ['claude-code'] }));
    const file = path.join(withHook, '.githooks/pre-commit');
    assert.match(readFileSync(file, 'utf8'), /check --stage pre-commit/);
    assert.match(readFileSync(file, 'utf8'), /Generated by go-getter apply; do not edit/);
    assert.equal(statSync(file).mode & 0o111, 0o111);
    assert.deepEqual(diffApply(withHook, planApply(withHook, { hosts: ['claude-code'] })), []);
  } finally {
    cleanup(without);
    cleanup(withHook);
  }
});

test('a pre-commit hook the user edited is kept, one nothing needs any more is removed, and remove deletes it', () => {
  const dir = project();
  try {
    writeApply(dir, planApply(dir, { hosts: HOSTS }));
    const file = path.join(dir, '.githooks/pre-commit');
    // Edited: apply leaves it alone and says so.
    writeFileSync(file, '#!/bin/sh\necho mine\n');
    const plan = planApply(dir, { hosts: HOSTS });
    assert.ok(plan.modified.some((m) => m.path === '.githooks/pre-commit'));
    writeApply(dir, plan);
    assert.match(readFileSync(file, 'utf8'), /echo mine/);
    // Restored to ours, then no entry lists pre-commit any more: the generated file goes.
    writeFileSync(file, readFileSync(path.join(dir, '.githooks/pre-push'), 'utf8').replace('pre-push', 'pre-commit'));
    writeApply(dir, planApply(dir, { hosts: HOSTS, force: true }));
    assert.ok(existsSync(file));
    for (const id of ['commit-rule', 'both-rule']) writeFileSync(path.join(dir, 'docs/guardrails', `${id}.md`), guardrail(id, [flagged(id)]));
    writeApply(dir, planApply(dir, { hosts: HOSTS }));
    assert.equal(existsSync(file), false);
    // And `apply --remove` deletes it while it exists.
    for (const id of ['commit-rule']) writeFileSync(path.join(dir, 'docs/guardrails', `${id}.md`), guardrail(id, [{ ...flagged(id), stages: ['pre-commit'] }]));
    writeApply(dir, planApply(dir, { hosts: HOSTS }));
    assert.ok(existsSync(file));
    applyRemove(dir, planRemove(dir));
    assert.equal(existsSync(file), false);
  } finally {
    cleanup(dir);
  }
});
