import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, symlinkSync, utimesSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { dotenvEntries, useCommands, scrub } from '../src/secrets/run.mjs';
import { pathMode } from '../src/hook.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const PASSWORD = 'Zx81Zx81Zx81Zx81';
const STATE_LOG = path.join('.go-getter', 'state', 'telemetry.jsonl');
// A fake key block built from parts: this file is scanned for secrets.
const PEM = ['-----BEGIN RSA PRIVATE KEY-----', 'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu', '-----END RSA PRIVATE KEY-----'].join('\n');

const decision = (data) => `---\nid: 0001-secrets\ntitle: Secrets\nstatus: active\ndate: 2026-10-10\ntags: [guardrail]\ntrack: process\ngo-getter:\n${Object.entries(data).map(([k, v]) => `  ${k}: "${v}"`).join('\n')}\n---\n\nx\n`;
const guardrail = (paths) => `---\nid: restricted\ntitle: restricted\nstatus: active\ndate: 2026-10-10\ntags: [guardrail]\ngoverned-by: 0001-secrets\ngrounded-in: [0001-secrets]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "denied"\n      run: "builtin:deny-path paths=\\"${paths}\\""\n    - tier: 1\n      check: "instruction"\n---\n\n## Guardrail\n\nAdvisory.\n`;

function project({ modes = 'use:.env.local, use:keys/*.pem', commands = '.env.local|node print.js, .env.local|node length.js, .env.local|node fail.js, keys/*.pem|node file.js', extra = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-secret-run-'));
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  };
  put('AGENTS.md', '# P\n');
  put('docs/guardrails/restricted.md', guardrail('.env,.env.local,keys/*.pem'));
  put('docs/decisions/0001-secrets.md', decision({ 'restricted-modes': modes, ...(commands ? { 'use-commands': commands } : {}), ...extra }));
  put('.env.local', `# comment\nAPI_URL=https://svc.example/api\nexport DB_PASSWORD=${PASSWORD}\nQUOTED="a b c d e f g h"\n`);
  put('.env', 'TOKEN=notallowedvalue123\n');
  put('keys/dev.pem', `${PEM}\n`);
  put('print.js', 'console.log(`password is ${process.env.DB_PASSWORD} ok`); console.error(`stderr ${process.env.DB_PASSWORD}`);');
  put('length.js', 'console.log(`len=${process.env.DB_PASSWORD.length} url=${process.env.API_URL} quoted=${process.env.QUOTED}`);');
  put('fail.js', 'process.exit(7);');
  put('file.js', "const fs = require('node:fs'); const p = process.env.DEV_PEM_FILE; console.log(`exists=${fs.existsSync(p)} mode=${(fs.statSync(p).mode & 0o777).toString(8)} dir=${(fs.statSync(require('node:path').dirname(p)).mode & 0o777).toString(8)} path=${p}`); console.log(fs.readFileSync(p, 'utf8'));");
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}
const run = (dir, ...args) => spawnSync(process.execPath, [cli, 'secret', 'run', ...args], { cwd: dir, encoding: 'utf8' });
const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

test('an approved command receives the entries as environment variables, and comments, export and quotes are read', () => {
  const dir = project();
  try {
    const r = run(dir, '--from', '.env.local', '--', 'node', 'length.js');
    assert.equal(r.status, 0, r.stderr);
    // Every value of a use file is scrubbed, secret or not: the file is the secret.
    assert.equal(r.stdout.trim(), 'len=16 url=[redacted by go-getter] quoted=[redacted by go-getter]');
  } finally {
    cleanup(dir);
  }
});

test('the output is scrubbed of the value on stdout and stderr, and the exit code passes through', () => {
  const dir = project();
  try {
    const r = run(dir, '--from', '.env.local', '--', 'node', 'print.js');
    assert.equal(r.status, 0);
    assert.equal(r.stdout.trim(), 'password is [redacted by go-getter] ok');
    assert.equal(r.stderr.trim(), 'stderr [redacted by go-getter]');
    assert.ok(!r.stdout.includes(PASSWORD) && !r.stderr.includes(PASSWORD));
    assert.equal(run(dir, '--from', '.env.local', '--', 'node', 'fail.js').status, 7);
  } finally {
    cleanup(dir);
  }
});

test('refusals: an unapproved command, a path that is not a use path, no approved commands, outside the project, a symlink out, a missing file', () => {
  const dir = project();
  const none = project({ commands: '' });
  const outside = mkdtempSync(path.join(tmpdir(), 'gg-secret-outside-'));
  try {
    writeFileSync(path.join(outside, 'x.env'), `OUT=${PASSWORD}\n`);
    symlinkSync(path.join(outside, 'x.env'), path.join(dir, '.env.link'));
    const cases = [
      [dir, ['--from', '.env.local', '--', 'node', 'other.js'], /"node other.js" is not approved/],
      [dir, ['--from', '.env', '--', 'node', 'print.js'], /not a use path \(its mode is deny\)/],
      [dir, ['--from', 'print.js', '--', 'node', 'print.js'], /not a use path/],
      [none, ['--from', '.env.local', '--', 'node', 'print.js'], /no command is approved/],
      [dir, ['--from', '../etc/passwd', '--', 'node', 'print.js'], /cannot be read|outside the project/],
      [dir, ['--from', path.join(outside, 'x.env'), '--', 'node', 'print.js'], /outside the project/],
      [dir, ['--from', '.env.link', '--', 'node', 'print.js'], /outside the project/],
      [dir, ['--from', 'missing.env', '--', 'node', 'print.js'], /cannot be read/],
    ];
    for (const [d, args, message] of cases) {
      const r = run(d, ...args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, message, args.join(' '));
      assert.equal(r.stdout, '');
      assert.ok(!r.stderr.includes(PASSWORD), 'a refusal never names a value');
    }
  } finally {
    cleanup(dir);
    cleanup(none);
    cleanup(outside);
  }
});

test('a pattern in use-commands must itself be a use pattern: a deny pattern with commands runs nothing', () => {
  const dir = project({ modes: 'use:keys/*.pem', commands: '.env.local|node print.js' });
  try {
    const r = run(dir, '--from', '.env.local', '--', 'node', 'print.js');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /not a use path/);
  } finally {
    cleanup(dir);
  }
});

test('bad usage exits 2 with the usage line', () => {
  const dir = project();
  try {
    for (const args of [[], ['--from', '.env.local'], ['--from', '.env.local', '--file', 'keys/dev.pem', '--', 'node', 'file.js'], ['--env', 'X', '--from', '.env.local', '--', 'node', 'print.js'], ['--from', '.env.local', '--']]) {
      const r = run(dir, ...args);
      assert.equal(r.status, 2, args.join(' '));
      assert.match(r.stderr, /usage: go-getter secret run/);
    }
  } finally {
    cleanup(dir);
  }
});

test('--file gives the command a 0600 copy in a 0700 directory, and it is gone afterwards', () => {
  const dir = project();
  const tmp = mkdtempSync(path.join(tmpdir(), 'gg-secret-tmp-'));
  try {
    const r = spawnSync(process.execPath, [cli, 'secret', 'run', '--file', 'keys/dev.pem', '--env', 'DEV_PEM_FILE', '--', 'node', 'file.js'], { cwd: dir, encoding: 'utf8', env: { ...process.env, TMPDIR: tmp } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /exists=true mode=600 dir=700 path=/);
    assert.ok(!r.stdout.includes('MIIBOgIBAAJB'), 'the key body is scrubbed');
    assert.match(r.stdout, /\[redacted by go-getter\]/);
    assert.deepEqual(readdirSync(tmp), [], 'the temporary file and directory are removed');
  } finally {
    cleanup(dir);
    cleanup(tmp);
  }
});

test('--file derives the variable name from the file when --env is not given', () => {
  const dir = project();
  const tmp = mkdtempSync(path.join(tmpdir(), 'gg-secret-tmp-'));
  try {
    const r = spawnSync(process.execPath, [cli, 'secret', 'run', '--file', 'keys/dev.pem', '--', 'node', 'file.js'], { cwd: dir, encoding: 'utf8', env: { ...process.env, TMPDIR: tmp } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /exists=true/, 'DEV_PEM_FILE is the derived name');
  } finally {
    cleanup(dir);
    cleanup(tmp);
  }
});

test('the temporary file is removed when the command is killed by a signal', async () => {
  const dir = project({ commands: '.env.local|node print.js, keys/*.pem|node sleep.js' });
  const tmp = mkdtempSync(path.join(tmpdir(), 'gg-secret-tmp-'));
  try {
    writeFileSync(path.join(dir, 'sleep.js'), "console.log('started'); setTimeout(() => {}, 30000);");
    const child = spawn(process.execPath, [cli, 'secret', 'run', '--file', 'keys/dev.pem', '--', 'node', 'sleep.js'], { cwd: dir, env: { ...process.env, TMPDIR: tmp }, stdio: ['ignore', 'pipe', 'pipe'] });
    for (let i = 0; i < 150 && readdirSync(tmp).length === 0; i++) await new Promise((r) => setTimeout(r, 20));
    assert.equal(readdirSync(tmp).length, 1, 'the copy exists while the command runs');
    child.kill('SIGTERM');
    await new Promise((resolve) => child.on('close', resolve));
    assert.deepEqual(readdirSync(tmp), [], 'removed after SIGTERM');
  } finally {
    cleanup(dir);
    cleanup(tmp);
  }
});

test('a --file run sweeps copies a hard kill left behind, only our own and only old ones', () => {
  const dir = project();
  const tmp = mkdtempSync(path.join(tmpdir(), 'gg-secret-tmp-'));
  try {
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    for (const name of ['gg-secret-stale', 'gg-secret-fresh', 'unrelated-old']) mkdirSync(path.join(tmp, name));
    utimesSync(path.join(tmp, 'gg-secret-stale'), old, old);
    utimesSync(path.join(tmp, 'unrelated-old'), old, old);
    const r = spawnSync(process.execPath, [cli, 'secret', 'run', '--file', 'keys/dev.pem', '--', 'node', 'file.js'], { cwd: dir, encoding: 'utf8', env: { ...process.env, TMPDIR: tmp } });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(readdirSync(tmp).sort(), ['gg-secret-fresh', 'unrelated-old']);
  } finally {
    cleanup(dir);
    cleanup(tmp);
  }
});

test('telemetry records the event and its outcome, never a value, a path or the command', () => {
  const dir = project({ extra: { 'telemetry-recording': 'metadata-log', 'telemetry-retention-days': '30' } });
  try {
    run(dir, '--from', '.env.local', '--', 'node', 'length.js');
    run(dir, '--from', '.env.local', '--', 'node', 'fail.js');
    run(dir, '--from', '.env.local', '--', 'node', 'other.js');
    const log = readFileSync(path.join(dir, STATE_LOG), 'utf8');
    const lines = log.trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => [l.event, l.outcome]), [['secret-run', 'pass'], ['secret-run', 'fail'], ['secret-run', 'blocked']]);
    for (const needle of [PASSWORD, '.env.local', 'length.js', 'node']) assert.ok(!log.includes(needle), needle);
  } finally {
    cleanup(dir);
  }
});

test('dotenv entries: comments, export, quotes, escapes, inline comments and a quoted value over several lines', () => {
  const text = ['# c', '', 'A=1', 'export B = two  # trailing', 'C="x y"', "D='raw \\n kept'", 'E="line\\nbreak"', 'F="multi', 'line"', 'not a key', '9BAD=no', 'G='].join('\n');
  assert.deepEqual(dotenvEntries(text), [['A', '1'], ['B', 'two'], ['C', 'x y'], ['D', 'raw \\n kept'], ['E', 'line\nbreak'], ['F', 'multi\nline'], ['G', '']]);
});

test('use-commands entries are read as pattern and command pairs', () => {
  const dir = project({ commands: '.env.local|node a.js, keys/*.pem|node b.js --flag, bad entry, |nothing' });
  try {
    assert.deepEqual(useCommands(dir), [{ pattern: '.env.local', command: 'node a.js' }, { pattern: 'keys/*.pem', command: 'node b.js --flag' }]);
  } finally {
    cleanup(dir);
  }
});

test('pathMode: use for a use path, deny for a deny path and for a file no restricted pattern matches', () => {
  const dir = project();
  try {
    assert.equal(pathMode(dir, '.env.local'), 'use');
    assert.equal(pathMode(dir, 'keys/dev.pem'), 'use');
    assert.equal(pathMode(dir, '.env'), 'deny');
    assert.equal(pathMode(dir, 'print.js'), 'deny');
  } finally {
    cleanup(dir);
  }
});

test('output streams a line at a time while the command runs, scrubbed', async () => {
  const dir = project({ commands: '.env.local|node stream.js' });
  try {
    writeFileSync(path.join(dir, 'stream.js'), "console.log('first ' + process.env.DB_PASSWORD); setTimeout(() => console.log('second'), 1500); setTimeout(() => {}, 1600);");
    const child = spawn(process.execPath, [cli, 'secret', 'run', '--from', '.env.local', '--', 'node', 'stream.js'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
    let first = null;
    const t0 = Date.now();
    let all = '';
    child.stdout.on('data', (d) => {
      all += d;
      if (first === null) first = Date.now() - t0;
    });
    await new Promise((resolve) => child.on('close', resolve));
    assert.equal(all, 'first [redacted by go-getter]\nsecond\n');
    assert.ok(first < 1300, `the first line arrived before the command ended (${first} ms)`);
  } finally {
    cleanup(dir);
  }
});

test('a value over several lines is read whole, and each of its lines is scrubbed', () => {
  const entries = dotenvEntries('KEY="part-one-1234\npart-two-5678"\n');
  assert.equal(entries[0][1], 'part-one-1234\npart-two-5678');
  assert.equal(scrub('x part-one-1234 y', new Set(['part-one-1234', 'part-two-5678'])), 'x [redacted by go-getter] y');
});

test('scrub removes longest values first and the shared patterns, and leaves short values and plain text alone', () => {
  const ghp = 'ghp_' + 'a1B2'.repeat(9);
  assert.equal(scrub('a secret-value-123 and secret-value-1234567 end', new Set(['secret-value-123', 'secret-value-1234567'])), 'a [redacted by go-getter] and [redacted by go-getter] end');
  assert.equal(scrub(`token ${ghp}`, new Set()), 'token [redacted by go-getter]');
  assert.equal(scrub('port 3000 true', new Set()), 'port 3000 true');
  assert.ok(existsSync(cli));
});
