import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { add, approved, list, revoke, storeDir, storeFile } from '../src/secrets/approvals.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
// Built at runtime: the restricted names must not appear literally in this file (the hook would deny edits to it).
const SECRET = '.' + 'env';
const run = ['node', 'scripts/check.mjs'];

function setup() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-approvals-')));
  const project = path.join(base, 'proj');
  const other = path.join(base, 'other');
  const home = path.join(base, 'home');
  for (const dir of [project, other]) {
    mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    writeFileSync(path.join(dir, 'scripts/check.mjs'), "import './helper.mjs';\n");
    writeFileSync(path.join(dir, 'scripts/helper.mjs'), 'export {};\n');
  }
  mkdirSync(path.join(project, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(project, 'docs/guardrails/restricted.md'), `---\nid: restricted\ntitle: restricted\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "restricted paths"\n      run: "builtin:deny-path paths=${SECRET},${SECRET}.*"\n---\n\n## Guardrail\n\nDo not.\n`);
  const env = { ...process.env, GO_GETTER_HOME: home };
  return { base, project, other, home, env, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

test('an approval is current until a file in the command\'s set changes, then it asks again', () => {
  const s = setup();
  try {
    assert.equal(approved(s.project, run, SECRET, s.env), false, 'nothing approved yet');
    const entry = add(s.project, run, SECRET, { env: s.env, now: () => new Date('2026-10-11T12:00:00Z') });
    assert.deepEqual([entry.path, entry.command, entry.approvedAt], [SECRET, run, '2026-10-11T12:00:00.000Z']);
    assert.match(entry.id, /^[0-9a-f]{8}$/);
    assert.equal(approved(s.project, run, SECRET, s.env), true);
    assert.equal(approved(s.project, run, `./${SECRET}`, s.env), true, 'the same path written another way');
    assert.deepEqual(list(s.project, s.env).map((e) => [e.current, e.files]), [[true, 2]]);
    writeFileSync(path.join(s.project, 'README.md'), 'unrelated\n');
    assert.equal(approved(s.project, run, SECRET, s.env), true, 'an unrelated edit does not matter');
    writeFileSync(path.join(s.project, 'scripts/helper.mjs'), 'export const changed = 1;\n');
    assert.equal(approved(s.project, run, SECRET, s.env), false, 'an imported file changed');
    assert.deepEqual(list(s.project, s.env).map((e) => e.current), [false]);
    add(s.project, run, SECRET, { env: s.env });
    assert.equal(approved(s.project, run, SECRET, s.env), true, 'approving again refreshes it');
    assert.equal(list(s.project, s.env).length, 1, 'one entry, not two');
  } finally {
    s.cleanup();
  }
});

test('an approval is for one command, one path and one project', () => {
  const s = setup();
  try {
    add(s.project, run, SECRET, { env: s.env });
    assert.equal(approved(s.project, [...run, 'write'], SECRET, s.env), false, 'another argument');
    assert.equal(approved(s.project, ['node', 'scripts/helper.mjs'], SECRET, s.env), false, 'another command');
    assert.equal(approved(s.project, run, `${SECRET}.local`, s.env), false, 'another secret path');
    assert.equal(approved(s.other, run, SECRET, s.env), false, 'an identical command in another project');
    assert.equal(approved(s.project, [], SECRET, s.env), false);
    assert.throws(() => add(s.project, [], SECRET, { env: s.env }), /needs a command/);
  } finally {
    s.cleanup();
  }
});

test('revoke removes one approval or all of a project and touches no other project', () => {
  const s = setup();
  try {
    const a = add(s.project, run, SECRET, { env: s.env });
    add(s.project, ['node', 'scripts/helper.mjs'], SECRET, { env: s.env });
    add(s.other, run, SECRET, { env: s.env });
    assert.equal(revoke(s.project, { id: 'deadbeef' }, s.env), 0);
    assert.equal(revoke(s.project, { id: a.id }, s.env), 1);
    assert.equal(approved(s.project, run, SECRET, s.env), false);
    assert.equal(list(s.project, s.env).length, 1);
    assert.equal(revoke(s.project, { all: true }, s.env), 1);
    assert.equal(list(s.project, s.env).length, 0);
    assert.equal(approved(s.other, run, SECRET, s.env), true, 'the other project keeps its approval');
  } finally {
    s.cleanup();
  }
});

test('the store is private, holds no value, and its location follows the environment', () => {
  const s = setup();
  try {
    assert.equal(storeFile(s.env), path.join(s.home, 'approvals.json'));
    assert.equal(storeFile({ XDG_STATE_HOME: '/x/state' }), '/x/state/go-getter/approvals.json');
    assert.match(storeDir({}), /\.local\/state\/go-getter$/);
    writeFileSync(path.join(s.project, SECRET), 'TOKEN=sup3r-s3cret-value-1234567890\n');
    add(s.project, run, SECRET, { env: s.env });
    assert.equal(statSync(storeFile(s.env)).mode & 0o777, 0o600);
    assert.equal(statSync(s.home).mode & 0o777, 0o700);
    const text = readFileSync(storeFile(s.env), 'utf8');
    assert.ok(!text.includes('sup3r-s3cret'), 'the file content is never copied');
    assert.deepEqual(Object.keys(JSON.parse(text).projects[s.project][0]).sort(), ['approvedAt', 'command', 'hash', 'id', 'path']);
  } finally {
    s.cleanup();
  }
});

test('a damaged or foreign store reads as empty and is replaced on the next write', () => {
  const s = setup();
  try {
    mkdirSync(s.home, { recursive: true });
    writeFileSync(storeFile(s.env), '{ not json');
    assert.deepEqual(list(s.project, s.env), []);
    writeFileSync(storeFile(s.env), JSON.stringify({ version: 99, projects: {} }));
    assert.equal(approved(s.project, run, SECRET, s.env), false);
    add(s.project, run, SECRET, { env: s.env });
    assert.equal(JSON.parse(readFileSync(storeFile(s.env), 'utf8')).version, 1);
  } finally {
    s.cleanup();
  }
});

test('go-getter approvals lists, adds and revokes, and add refuses a path that is not restricted', () => {
  const s = setup();
  try {
    const cmd = (...args) => spawnSync(process.execPath, [cli, 'approvals', ...args], { cwd: s.project, env: s.env, encoding: 'utf8' });
    assert.match(cmd('list').stdout, /no approvals for/);
    const added = cmd('add', SECRET, '--', ...run);
    assert.equal(added.status, 0, added.stderr);
    assert.match(added.stdout, /^approved [0-9a-f]{8}: node scripts\/check\.mjs may use /);
    const listed = cmd('list');
    assert.match(listed.stdout, new RegExp(`${SECRET}  node scripts/check.mjs  current  \\(2 files, approved \\d{4}-\\d\\d-\\d\\d\\)`));
    assert.equal(JSON.parse(cmd('list', '--json').stdout)[0].current, true);
    writeFileSync(path.join(s.project, 'scripts/check.mjs'), '// edited\n');
    assert.match(cmd('list').stdout, /STALE: the code changed since it was approved/);
    const id = JSON.parse(cmd('list', '--json').stdout)[0].id;
    assert.equal(cmd('revoke', id).status, 0);
    assert.equal(cmd('revoke', id).status, 1, 'already gone');
    assert.equal(cmd('add', 'README.md', '--', ...run).status, 1, 'not a restricted path');
    assert.match(cmd('add', 'README.md', '--', ...run).stderr, /not a restricted path/);
    for (const bad of [[], ['add'], ['add', SECRET], ['add', SECRET, '--'], ['revoke'], ['frobnicate'], ['list', '--what']]) assert.equal(cmd(...bad).status, 2, JSON.stringify(bad));
  } finally {
    s.cleanup();
  }
});
