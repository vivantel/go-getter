import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCheckpoint, snapshotCommit } from '../src/checkpoint.mjs';

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });

function repo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-cp-restricted-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 't@t');
  git(dir, 'config', 'user.name', 't');
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/guardrails/no-env.md'), '---\nid: no-env\ntitle: no-env title\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "env blocked"\n      run: "builtin:deny-path paths=.env,secrets/**,*.key"\n---\n\n## Guardrail\n\nDo it.\n');
  writeFileSync(path.join(dir, 'a.txt'), 'one\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'init');
  // untracked restricted files: the working tree holds them, git does not
  writeFileSync(path.join(dir, '.env'), 'TOKEN=abcdefghijkl\n');
  writeFileSync(path.join(dir, 'server.key'), 'not a pattern secret\n');
  mkdirSync(path.join(dir, 'secrets'));
  writeFileSync(path.join(dir, 'secrets/db.txt'), 'plain words\n');
  writeFileSync(path.join(dir, 'b.txt'), 'two\n');
  return dir;
}

const files = (dir, commit) => git(dir, 'ls-tree', '-r', '--name-only', commit).split('\n').filter(Boolean);

test('a checkpoint snapshot of a tree with untracked restricted files excludes them', () => {
  const dir = repo();
  const { commit } = createCheckpoint(dir, { label: 'x' });
  const held = files(dir, commit);
  assert.ok(held.includes('b.txt'), 'ordinary untracked files are still saved');
  for (const f of ['.env', 'server.key', 'secrets/db.txt']) assert.ok(!held.includes(f), `${f} must not be in the checkpoint`);
});

test('the per-unit snapshot (pushed to a remote) excludes them too', () => {
  const dir = repo();
  const held = files(dir, snapshotCommit(dir, { message: 'unit' }).commit);
  assert.ok(held.includes('b.txt'));
  for (const f of ['.env', 'server.key', 'secrets/db.txt']) assert.ok(!held.includes(f), `${f} must not be in the snapshot`);
});
