// The governance pack's use-commands and sink-sources answers (decision 0107) reach go-getter secret run and put, and the
// pre-tool hook lets exactly those two calls name a use or sink path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadPack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { evaluatePreTool } from '../src/hook.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');
const pack = loadPack(path.join(root, 'src/packs/governance/pack.json'));
const VALUE = 'Pack-Secret-123456789';

const base = () => ({
  ...Object.fromEntries(pack.questions.filter((q) => q.options).map((q) => [q.id, q.options.find((o) => o.recommended).id])),
  'restricted-paths': ['config/dev.secrets', 'config/out.secrets'],
  'restricted-modes': ['use:config/dev.secrets', 'sink:config/out.secrets'],
  'use-commands': ['config/dev.secrets|node check.js', 'config/dev.secrets|node other.js'],
  'sink-sources': ['config/out.secrets|vault|node emit.js'],
});

function project(answers = base()) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-secret-pack-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  mkdirSync(path.join(dir, 'config'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\ngovernance — x\nsecurity — x\nenforcement — x\nguardrail — x\n');
  writeFileSync(path.join(dir, 'config/dev.secrets'), `DB_PASSWORD=${VALUE}\n`);
  writeFileSync(path.join(dir, 'check.js'), 'console.log(`got ${process.env.DB_PASSWORD}; len ${process.env.DB_PASSWORD.length}`);');
  writeFileSync(path.join(dir, 'emit.js'), `process.stdout.write('${VALUE}-written\\n');`);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-10-11' }) });
  return dir;
}
const cli_ = (dir, ...args) => spawnSync(process.execPath, [cli, 'secret', ...args], { cwd: dir, encoding: 'utf8' });
const call = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

test('answers rendered by the pack reach secret run and put end to end', () => {
  const dir = project();
  try {
    const run = cli_(dir, 'run', '--from', 'config/dev.secrets', '--', 'node', 'check.js');
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.stdout.trim(), 'got [redacted by go-getter]; len 21');
    const refused = cli_(dir, 'run', '--from', 'config/dev.secrets', '--', 'node', 'unlisted.js');
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /not approved.*"node check.js", "node other.js"/);
    const put = cli_(dir, 'put', 'config/out.secrets', '--from-command', 'vault');
    assert.equal(put.status, 0, put.stderr);
    assert.equal(readFileSync(path.join(dir, 'config/out.secrets'), 'utf8'), `${VALUE}-written\n`);
    assert.ok(!put.stdout.includes(VALUE));
  } finally {
    cleanup(dir);
  }
});

test('with the answers left empty, nothing is approved: run and put both refuse', () => {
  const dir = project({ ...base(), 'use-commands': [], 'sink-sources': [] });
  try {
    assert.match(cli_(dir, 'run', '--from', 'config/dev.secrets', '--', 'node', 'check.js').stderr, /no command is approved/);
    assert.match(cli_(dir, 'put', 'config/out.secrets', '--from-command', 'vault').stderr, /no source is declared/);
    assert.equal(existsSync(path.join(dir, 'config/out.secrets')), false);
  } finally {
    cleanup(dir);
  }
});

test('an answer file from before 0.5.0 renders with nothing approved', () => {
  const old = base();
  delete old['use-commands'];
  delete old['sink-sources'];
  const dir = project(old);
  try {
    assert.match(cli_(dir, 'run', '--from', 'config/dev.secrets', '--', 'node', 'check.js').stderr, /no command is approved/);
  } finally {
    cleanup(dir);
  }
});

test('the hook lets exactly secret run on a use path and secret put on a sink path name them', () => {
  const dir = project();
  const denied = (command) => evaluatePreTool(dir, call(command), 'claude-code').deny;
  try {
    assert.equal(denied('go-getter secret run --from config/dev.secrets -- node check.js'), false);
    assert.equal(denied('go-getter secret put config/out.secrets --from-command vault'), false);
    // Everything else that names them is denied.
    assert.equal(denied('cat config/dev.secrets'), true);
    assert.equal(denied('cat config/out.secrets'), true);
    assert.equal(denied('go-getter secret run --from config/out.secrets -- node check.js'), true, 'run on a sink path');
    assert.equal(denied('go-getter secret put config/dev.secrets --from-command vault'), true, 'put on a use path');
    assert.equal(denied('go-getter verify config/dev.secrets'), true, 'another go-getter command');
    assert.equal(denied('go-getter secret run --from config/dev.secrets -- node check.js | cat'), true, 'a pipeline');
    assert.equal(denied('go-getter secret run --from config/dev.secrets -- sh -c "cat config/dev.secrets"'), true, 'quoting');
    assert.equal(denied('go-getter secret get config/dev.secrets'), true, 'an unknown subcommand');
  } finally {
    cleanup(dir);
  }
});

test('the rendered mode decision no longer says the modes are inactive', () => {
  const dir = project();
  try {
    const text = readFileSync(path.join(dir, 'docs/decisions', execFileSync('ls', [path.join(dir, 'docs/decisions')], { encoding: 'utf8' }).split('\n').find((f) => f.endsWith('restricted-path-modes.md'))), 'utf8');
    assert.doesNotMatch(text, /Until `go-getter secret run`/);
    assert.match(text, /a call that is exactly `go-getter secret run`/);
  } finally {
    cleanup(dir);
  }
});
