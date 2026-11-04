import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cleanGitEnv } from '../src/git-env.mjs';
import { claimUnit } from '../src/work/ops.mjs';
import { nextUnits, ownerFits } from '../src/work/next.mjs';

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();

const PLAN = `# Feature
Owner-id: dana

### S1 One — [ ]
Class: implement · Needs: none · Scope: src/a/** · Check: \`true\`
Do: change the a module.

### S2 Two — [ ]
Class: implement · Needs: S0 · Scope: src/z/** · Check: \`true\`
Do: needs an unfinished step.

### S3 Three — [ ]
Class: implement · Needs: none · Scope: src/a/x.mjs · Check: \`true\`
Do: inside the a module.

### S4 Four — [ ]
Class: implement · Needs: none · Scope: tag:billing · Check: \`true\`
Do: change billing.

### S5 Five — [ ]
Class: implement · Needs: none · Scope: tag:billing, src/c.mjs · Check: \`true\`
Do: also billing.

### S6 Six — [ ]
Class: implement · Needs: none · Owner: human · Scope: src/h/** · Check: \`true\`
Do: a person's step.

### S0 Zero — [ ]
Class: implement · Needs: none · Scope: src/zero.mjs · Check: \`true\`
Do: first.
`;

function repo() {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-wnext-')));
  sh(dir, 'init', '-q', '-b', 'main');
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/feat.md'), PLAN);
  return dir;
}
const ids = (list) => list.map((x) => x.unit.split('#')[1]);
const agent = { kind: 'agent', id: 'w-a' };

test('a unit with unmet Needs is skipped and a human-owned unit is left to a person', () => {
  const r = nextUnits(repo());
  assert.ok(!ids(r.ready).includes('S2'));
  assert.match(r.skipped.find((s) => s.unit === 'feat#S2').reason, /needs S0/);
  assert.ok(!ids(r.ready).includes('S6'));
  assert.deepEqual(ids(r.ready), ['S0', 'S1', 'S4']); // S0 first: S2 waits on it (critical path, decision 0174)
  assert.ok(ids(nextUnits(repo(), { ownerKind: 'human' }).ready).includes('S6'));
});

test('overlapping units are queued behind the unit chosen first, with the tokens', () => {
  const r = nextUnits(repo());
  const q = r.queued.find((x) => x.unit === 'feat#S3');
  assert.equal(q.behind, 'feat#S1');
  assert.ok(q.tokens.length);
});

test('an overlap through a shared decision tag is queued', () => {
  const r = nextUnits(repo());
  assert.equal(r.queued.find((x) => x.unit === 'feat#S5').behind, 'feat#S4');
});

test('a live claim queues the units that overlap it and removes the claimed unit', async () => {
  const dir = repo();
  const c = await claimUnit(dir, 'feat#S3', agent, { remote: null });
  assert.ok(c.ok, c.error);
  const r = nextUnits(dir);
  assert.ok(!ids(r.ready).includes('S3') && !ids(r.ready).includes('S1'));
  assert.equal(r.queued.find((x) => x.unit === 'feat#S1').behind, 'feat#S3');
  assert.equal(r.skipped.find((s) => s.unit === 'feat#S3').reason, 'claimed');
});

test('Owner filtering follows the caller kind', () => {
  assert.equal(ownerFits('human', 'agent'), false);
  assert.equal(ownerFits('human', 'human'), true);
  assert.equal(ownerFits('agent', 'ci'), true);
  assert.equal(ownerFits('agent', 'human'), false);
  assert.equal(ownerFits('either', 'ci'), true);
});

test('--dry-run claims nothing and plain work next claims the first ready unit', () => {
  const dir = repo();
  const cli = path.join(path.resolve(import.meta.dirname, '..'), 'bin/go-getter.mjs');
  const run = (...a) => execFileSync(process.execPath, [cli, 'work', 'next', ...a], { cwd: dir, encoding: 'utf8', env: { ...cleanGitEnv(process.env), CI: '', GO_GETTER_WORKER: 'w-t' } });
  const dry = run('--dry-run');
  assert.match(dry, /feat#S1: ready/);
  assert.equal(sh(dir, 'for-each-ref', 'refs/go-getter/claims'), '');
  assert.match(run(), /feat#S0: claimed by agent w-t/);
  assert.notEqual(sh(dir, 'for-each-ref', 'refs/go-getter/claims'), '');
});
