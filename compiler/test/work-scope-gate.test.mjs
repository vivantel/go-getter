import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { cleanGitEnv } from '../src/git-env.mjs';
import { claimUnit, ledgerView } from '../src/work/ops.mjs';
import { checkScope, formatScope, requestChange, REQUESTS } from '../src/work/scope-gate.mjs';
import { verify } from '../src/verify.mjs';

const cli = path.resolve(import.meta.dirname, '..', 'bin', 'go-getter.mjs');
const env = { ...cleanGitEnv(process.env), CI: '', GO_GETTER_WORKER: 'w-a' };
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();

const PLAN = `# Feature

### S1 One — [ ]
Class: implement · Needs: none · Scope: src/a/** · Check: \`true\`
Issue: acme/widgets#5
Do: change the a module.

### S2 Two — [ ]
Class: implement · Needs: none · Scope: src/b/** · Check: \`true\`
Do: change the b module.

### S3 Three — [ ]
Class: implement · Needs: none · Scope: src/a/x.mjs · Check: \`true\`
Do: inside a.
`;

const agent = { kind: 'agent', id: 'w-a' };

function repo() {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-sgate-')));
  sh(dir, 'init', '-q', '-b', 'main');
  sh(dir, 'config', 'user.name', 't');
  sh(dir, 'config', 'user.email', 't@example.test');
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  mkdirSync(path.join(dir, 'src/a'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/feat.md'), PLAN);
  writeFileSync(path.join(dir, 'src/a/x.mjs'), 'export {};\n');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'init');
  return dir;
}
const touch = (dir, rel) => {
  mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  writeFileSync(path.join(dir, rel), `// ${Math.random()}\n`);
};

test('a worktree with no claimed unit has no scope and passes', () => {
  const dir = repo();
  touch(dir, 'src/b/y.mjs');
  const r = checkScope(dir);
  assert.equal(r.status, 'no-unit');
  assert.match(formatScope(r), /no unit/);
});

test('an in-scope diff passes and an out-of-scope path fails by name', async () => {
  const dir = repo();
  assert.ok((await claimUnit(dir, 'feat#S1', agent, { remote: null })).ok);
  touch(dir, 'src/a/new.mjs');
  touch(dir, 'src/a/deep/more.mjs');
  assert.equal(checkScope(dir).status, 'ok');
  touch(dir, 'src/b/y.mjs');
  const r = checkScope(dir);
  assert.equal(r.status, 'out-of-scope');
  assert.deepEqual(r.outside, ['src/b/y.mjs']);
  assert.match(formatScope(r), /src\/b\/y\.mjs/);
});

test('the unit\'s own plan file, generated indexes and the plugin copy are always allowed; another plan file is not', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  writeFileSync(path.join(dir, 'docs/plans/feat.md'), `${PLAN}\nmore\n`);
  touch(dir, 'docs/decisions/INDEX.md');
  touch(dir, 'plugins/go-getter/skills/x.md');
  assert.equal(checkScope(dir).status, 'ok');
  touch(dir, 'docs/plans/other.md');
  assert.deepEqual(checkScope(dir).outside, ['docs/plans/other.md']);
});

test('committed changes count against the base', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  sh(dir, 'branch', 'base');
  touch(dir, 'src/b/y.mjs');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'out');
  assert.deepEqual(checkScope(dir, { base: 'base' }).outside, ['src/b/y.mjs']);
});

test('verify reports a scope check only when a unit is claimed, and fails it for an outside path', async () => {
  const dir = repo();
  assert.deepEqual((await verify(dir, 'implement')).results.map((r) => r.name), []);
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  touch(dir, 'src/b/y.mjs');
  const v = await verify(dir, 'implement');
  assert.equal(v.ok, false);
  assert.equal(v.results.find((r) => r.name === 'scope').ok, false);
  assert.match(v.results.find((r) => r.name === 'scope').output, /src\/b\/y\.mjs/);
});

test('a change request is recorded, posted as a comment when allowed, and refused when it holds a secret', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  const local = await requestChange(dir, 'feat#S1', 'feat#S2', agent, { text: 'I need an export in src/b/y.mjs' });
  assert.equal(local.ok, true);
  assert.equal(local.how, 'local');
  assert.match(local.text, /src\/b\/y\.mjs/);
  const log = readFileSync(path.join(dir, REQUESTS), 'utf8');
  assert.match(log, /"from":"feat#S1","to":"feat#S2"/);
  assert.doesNotMatch(log, /export in/, 'the log holds the units, never the text');
  const posted = [];
  const target = await requestChange(dir, 'S1', 'feat#S1', agent, { text: 'x' });
  assert.equal(target.ok, false, 'a unit cannot ask itself');
  const viaTracker = await requestChange(dir, 'S1', 'feat#S2', agent, { text: 'hi', comment: async (t) => (posted.push(t), { ok: true }) });
  assert.equal(viaTracker.how, 'local', 'S2 has no issue, so there is nothing to comment on');
  const secret = await requestChange(dir, 'S1', 'feat#S2', agent, { text: 'token ghp_abcdefghijklmnopqrstuvwxyz0123456789' });
  assert.equal(secret.ok, false);
  assert.match(secret.error, /refused: the request would send/);
});

test('a request to a unit with an issue is posted as a comment', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S2', agent, { remote: null });
  const posted = [];
  const r = await requestChange(dir, 'feat#S2', 'feat#S1', agent, { text: 'please add a hook', comment: async (t) => (posted.push(t), { ok: true }) });
  assert.equal(r.how, 'comment');
  assert.match(posted[0], /feat#S2: please add a hook/);
});

test('a request that parks releases the scope, keeps a claim that never lapses, and lets an overlapping unit be claimed', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  assert.equal((await claimUnit(dir, 'feat#S3', { kind: 'agent', id: 'w-b' }, { remote: null })).code, 'queued', 'S3 overlaps the live S1');
  const r = await requestChange(dir, 'feat#S1', 'feat#S2', agent, { text: 'need b', park: true, remote: null });
  assert.equal(r.parked, true);
  const view = ledgerView(dir, 'feat', { now: new Date(Date.now() + 30 * 86_400_000) });
  const entry = view.entries.find((e) => e.unit === 'feat#S1');
  assert.equal(entry.state, 'parked');
  assert.deepEqual(entry.scope, []);
  assert.equal(view.annotated.states.get('feat#S1').live, true, 'a parked claim does not lapse');
  assert.equal(checkScope(dir).status, 'no-unit', 'the worker no longer holds a scope');
  assert.ok((await claimUnit(dir, 'feat#S3', { kind: 'agent', id: 'w-b' }, { remote: null })).ok, 'the overlapping unit can be claimed now');
});

test('the CLI fails an out-of-scope path with exit 1 and names it', async () => {
  const dir = repo();
  await claimUnit(dir, 'feat#S1', agent, { remote: null });
  const ok = spawnSync(process.execPath, [cli, 'work', 'scope-check'], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  touch(dir, 'src/b/y.mjs');
  const bad = spawnSync(process.execPath, [cli, 'work', 'scope-check'], { cwd: dir, env, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /src\/b\/y\.mjs/);
});
