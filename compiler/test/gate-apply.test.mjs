// Native ask rules written by apply for a gate-command guardrail (decision 0094, plan hitl-pack step 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, readlinkSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planApply, applyPlan, diffApply } from '../src/apply.mjs';
import { readManifest } from '../src/manifest.mjs';
import { HOSTS } from '../src/capabilities.mjs';
import { packageCapabilities } from '../src/governance.mjs';
import { CATALOG, nativeRules, withAskRules, gateEntries } from '../src/gate.mjs';
import { runTier3 } from '../src/enforce.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const caps = packageCapabilities();

const guardrail = (id, tier, run) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: active\ndate: 2026-10-09\ntags: [guardrail]\ngoverned-by: 0001-x\ngrounded-in: [0001-x]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: ${tier}\n      check: "${id}"\n      run: '${run}'\n---\n\n## Guardrail\n\nDo it.\n`;
const GATE = 'docs/guardrails/gated-actions.md';
const text = (value) => `${JSON.stringify(value, null, 2)}\n`;

const USER = {
  '.claude/settings.json': { model: 'x', permissions: { allow: ['Bash(npm test)'], ask: ['Bash(make deploy *)'] } },
  'kilo.json': { permission: { edit: 'ask', bash: { '*': 'allow', 'git push *': 'allow', 'git push --force*': 'deny', 'ls *': 'allow' } } },
  'opencode.json': { model: 'x', permission: { '*': 'allow' } },
};

function project({ gate = 'builtin:gate-command classes=irreversible,outward', user = USER } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-gateapply-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  if (gate) writeFileSync(path.join(dir, GATE), guardrail('gated-actions', 2, gate));
  for (const [rel, value] of Object.entries(user)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text(value));
  }
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

function snapshot(dir, rel = '') {
  const out = {};
  for (const name of readdirSync(path.join(dir, rel)).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    if (r === '.git') continue;
    const stat = lstatSync(path.join(dir, r));
    if (stat.isSymbolicLink()) out[r] = `-> ${readlinkSync(path.join(dir, r))}`;
    else if (stat.isDirectory()) Object.assign(out, { [`${r}/`]: 'dir' }, snapshot(dir, r));
    else out[r] = readFileSync(path.join(dir, r), 'utf8');
  }
  return out;
}

const adopt = (dir, hosts = HOSTS) => applyPlan(dir, planApply(dir, { hosts, skills: false }));
const read = (dir, rel) => JSON.parse(readFileSync(path.join(dir, rel), 'utf8'));
const rules = (host, classes = ['irreversible', 'outward']) => nativeRules(host, CATALOG.filter((e) => classes.includes(e.class)), caps);

// OpenCode's evaluation (`evaluate` in its permission module): the last rule, in config order, whose glob matches.
function opencodeAction(permission, command) {
  const glob = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replace(/ \.\*$/, '(?: .*)?')}$`);
  const list = typeof permission === 'string' ? [['*', permission]] : Object.entries(permission).filter(([k]) => k === '*' || k === 'bash')
    .flatMap(([, v]) => (typeof v === 'string' ? [['*', v]] : Object.entries(v)));
  return list.findLast(([g]) => glob(g).test(command))?.[1];
}

test('apply writes the native ask rules of the three hosts, records them and installs the hook', () => {
  const dir = project();
  adopt(dir);
  const claude = read(dir, '.claude/settings.json');
  assert.deepEqual(claude.permissions.ask, ['Bash(make deploy *)', ...rules('claude-code')]);
  for (const rel of ['kilo.json', 'opencode.json']) {
    const bash = read(dir, rel).permission.bash;
    for (const glob of Object.keys(rules('kilo'))) if (glob !== 'git push --force*') assert.equal(bash[glob], 'ask', `${rel} ${glob}`);
  }
  const manifest = readManifest(dir);
  assert.deepEqual(manifest.shared['.claude/settings.json'].find((i) => i.path.join('.') === 'permissions.ask').items, rules('claude-code'));
  const kiloKeys = manifest.shared['kilo.json'].map((i) => i.path.at(-1));
  assert.ok(kiloKeys.includes('git push *') && kiloKeys.includes('rm -rf*') && !kiloKeys.includes('ls *'));
  assert.deepEqual(manifest.shared['opencode.json'].map((i) => i.path.slice(0, 2)), Object.keys(rules('opencode')).map(() => ['permission', 'bash']));
  assert.ok(manifest.shared['opencode.json'].every((i) => i.kind === 'key' && !('replaced' in i)));
  // the gate is tier 2, so the hook is installed: it hands gated commands over on the other hosts
  assert.ok(claude.hooks.PreToolUse.length);
  assert.ok(read(dir, '.cursor/hooks.json').hooks.preToolUse.length);
  assert.ok(read(dir, '.codex/hooks.json').hooks.PreToolUse.length);
  rmSync(dir, { recursive: true, force: true });
});

test('a second apply leaves every file byte-identical', () => {
  const dir = project();
  adopt(dir);
  const first = snapshot(dir);
  assert.deepEqual(diffApply(dir, planApply(dir, { hosts: HOSTS, skills: false })), []);
  adopt(dir);
  assert.deepEqual(snapshot(dir), first);
  rmSync(dir, { recursive: true, force: true });
});

test('the user\'s own rules survive and are never weakened', () => {
  const dir = project();
  adopt(dir);
  const claude = read(dir, '.claude/settings.json');
  assert.deepEqual(claude.permissions.allow, ['Bash(npm test)']);
  assert.equal(claude.model, 'x');
  const kilo = read(dir, 'kilo.json').permission;
  assert.equal(kilo.edit, 'ask');
  const want = { 'git push origin main': 'ask', 'git push --force': 'deny', 'git push origin main --force': 'ask', 'rm -rf build': 'ask', 'ls -la': 'allow', 'git status': 'allow' };
  for (const [command, action] of Object.entries(want)) assert.equal(opencodeAction(kilo, command), action, `kilo: ${command}`);
  const opencode = read(dir, 'opencode.json');
  assert.equal(opencode.model, 'x');
  for (const [command, action] of Object.entries({ 'git push': 'ask', 'gh pr create --fill': 'ask', 'ls': 'allow' })) assert.equal(opencodeAction(opencode.permission, command), action, `opencode: ${command}`);
  rmSync(dir, { recursive: true, force: true });
});

test('a user setting that already asks or denies is left alone', () => {
  const user = { 'kilo.json': { permission: { bash: 'deny' } }, 'opencode.json': { permission: { '*': 'ask' } } };
  const dir = project({ user });
  const plan = planApply(dir, { hosts: ['kilo', 'opencode'], skills: false });
  assert.deepEqual(plan.notes, []);
  applyPlan(dir, plan);
  assert.equal(readFileSync(path.join(dir, 'kilo.json'), 'utf8'), text(user['kilo.json']));
  assert.equal(readFileSync(path.join(dir, 'opencode.json'), 'utf8'), text(user['opencode.json']));
  rmSync(dir, { recursive: true, force: true });
});

const merge = (permission, globs = ['git push *']) => withAskRules('opencode-permission', { permission }, Object.fromEntries(globs.map((g) => [g, 'ask'])));

test('an added glob never turns a user deny into ask, and what it cannot cover is reported', () => {
  const { config, unprompted } = merge({ bash: { '*': 'allow', 'git push --force*': 'deny', 'git push': 'allow' } });
  assert.deepEqual(Object.keys(config.permission.bash), ['*', 'git push *', 'git push --force*', 'git push']);
  const action = (c) => opencodeAction(config.permission, c);
  assert.equal(action('git push --force'), 'deny');
  assert.equal(action('git push origin main'), 'ask');
  assert.equal(action('git push'), 'allow');
  assert.deepEqual(unprompted, ['git push *']);
});

test('an added glob beats the user\'s narrower allows that do not match the bare command', () => {
  const { config, unprompted } = merge({ bash: { 'git push origin*': 'allow' } });
  assert.equal(opencodeAction(config.permission, 'git push origin main'), 'ask');
  assert.deepEqual(unprompted, []);
});

test('a user key with the same glob is set to ask in place, never moved', () => {
  const { config, unprompted } = merge({ bash: { 'git push *': 'allow', 'git push --force*': 'deny', 'git *': 'allow' } });
  assert.deepEqual(Object.entries(config.permission.bash), [['git push *', 'ask'], ['git push --force*', 'deny'], ['git *', 'allow']]);
  assert.deepEqual(unprompted, ['git push *']);
});

test('rules a later global key or a string setting would defeat are reported', () => {
  const later = merge({ bash: {}, '*': 'allow' });
  assert.deepEqual(later.unprompted, ['git push *']);
  for (const permission of ['allow', { bash: 'allow' }]) {
    const { config, unprompted, reason } = merge(permission);
    assert.deepEqual(config, { permission });
    assert.deepEqual(unprompted, ['git push *']);
    assert.match(reason, /is a string; write it as a map/);
  }
});

test('apply reports patterns it left unprompted', () => {
  const dir = project({ user: { 'kilo.json': { permission: 'allow' } } });
  const plan = planApply(dir, { hosts: ['kilo'], skills: false });
  assert.equal(plan.notes.length, 1);
  assert.match(plan.notes[0], /^note: kilo\.json: \d+ gated pattern\(s\) still run without a prompt on kilo, since its permission is a string/);
  rmSync(dir, { recursive: true, force: true });
});

test('narrowing the classes and removing the guardrail take the rules out again', () => {
  const dir = project();
  adopt(dir);
  writeFileSync(path.join(dir, GATE), guardrail('gated-actions', 2, 'builtin:gate-command classes=outward'));
  adopt(dir);
  assert.deepEqual(read(dir, '.claude/settings.json').permissions.ask, ['Bash(make deploy *)', ...rules('claude-code', ['outward'])]);
  assert.ok(!('rm -rf*' in read(dir, 'opencode.json').permission.bash));

  rmSync(path.join(dir, GATE));
  adopt(dir);
  assert.deepEqual(read(dir, '.claude/settings.json').permissions, USER['.claude/settings.json'].permissions);
  for (const rel of ['kilo.json', 'opencode.json']) assert.equal(readFileSync(path.join(dir, rel), 'utf8'), text(USER[rel]), rel);
  assert.ok(!readManifest(dir).shared['kilo.json']);
  rmSync(dir, { recursive: true, force: true });
});

test('a file apply created for the rules is emptied when they go, never deleted', () => {
  const dir = project({ user: {} });
  adopt(dir, ['kilo']);
  assert.ok(read(dir, 'kilo.json').permission.bash['git push *']);
  rmSync(path.join(dir, GATE));
  adopt(dir, ['kilo']);
  assert.equal(readFileSync(path.join(dir, 'kilo.json'), 'utf8'), '{}\n');
  assert.ok(!readManifest(dir).shared['kilo.json']);
  rmSync(dir, { recursive: true, force: true });
});

test('apply --remove restores the files', () => {
  const dir = project();
  const original = snapshot(dir);
  adopt(dir);
  const res = spawnSync('node', [cli, 'apply', '--project', dir, '--remove'], { encoding: 'utf8' });
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(snapshot(dir), original);
  rmSync(dir, { recursive: true, force: true });
});

test('as a tier-3 check the gate reports ok and says where it is enforced', async () => {
  const dir = project({ gate: null, user: {} });
  writeFileSync(path.join(dir, GATE), guardrail('gated-actions', 3, 'builtin:gate-command classes=outward'));
  const [result] = await runTier3(dir);
  assert.equal(result.ok, true);
  assert.equal(result.message, 'enforced by host ask rules and the pre-tool hook');
  rmSync(dir, { recursive: true, force: true });
});

test('claude-permissions adds no empty permissions.ask when there is nothing to add', () => {
  assert.deepEqual(withAskRules('claude-permissions', {}, []).config, {});
  const config = { permissions: { ask: ['Bash(git push *)'] } };
  assert.equal(withAskRules('claude-permissions', config, ['Bash(git push *)']).config, config);
});

test('a null permission in an opencode-format file is treated as no permission', () => {
  const { config } = withAskRules('opencode-permission', { permission: null }, { 'git push *': 'ask' });
  assert.deepEqual(config.permission, { bash: { 'git push *': 'ask' } });
});

test('a gate-command with an unknown or empty class list fails loudly', () => {
  const entry = (classes) => [{ guardrail: 'g', tier: 2, parsed: { kind: 'builtin', id: 'gate-command', args: { classes } } }];
  assert.throws(() => gateEntries(entry('irreversable')), /classes must be irreversible and\/or outward, not irreversable/);
  assert.throws(() => gateEntries(entry('')), /classes must be/);
  assert.ok(gateEntries(entry('outward')).length > 0);
});
