import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { sinkSources } from '../src/secrets/put.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const VALUE = 'S3cretValue-ABCDEF123456';
const STATE_LOG = path.join('.go-getter', 'state', 'telemetry.jsonl');

const decision = (data) => `---\nid: 0001-secrets\ntitle: Secrets\nstatus: active\ndate: 2026-10-10\ntags: [guardrail]\ntrack: process\ngo-getter:\n${Object.entries(data).map(([k, v]) => `  ${k}: "${v}"`).join('\n')}\n---\n\nx\n`;
const guardrail = (paths) => `---\nid: restricted\ntitle: restricted\nstatus: active\ndate: 2026-10-10\ntags: [guardrail]\ngoverned-by: 0001-secrets\ngrounded-in: [0001-secrets]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "denied"\n      run: "builtin:deny-path paths=\\"${paths}\\""\n    - tier: 1\n      check: "instruction"\n---\n\n## Guardrail\n\nAdvisory.\n`;

function project({ modes = 'sink:out/secret.txt, sink:.env.generated, use:.env.local', sources = 'out/secret.txt|vault|node emit.js, .env.generated|vault|node emit.js, out/secret.txt|empty|node empty.js, out/secret.txt|broken|node broken.js, out/secret.txt|missing|nosuchbinary-xyz', extra = {} } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-secret-put-'));
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  };
  put('AGENTS.md', '# P\n');
  put('docs/guardrails/restricted.md', guardrail('out/secret.txt,.env.generated,.env.local'));
  put('docs/decisions/0001-secrets.md', decision({ 'restricted-modes': modes, ...(sources ? { 'sink-sources': sources } : {}), ...extra }));
  put('emit.js', `process.stdout.write('${VALUE}\\n');`);
  put('empty.js', '// prints nothing');
  put('broken.js', "console.error('item not found in vault'); process.exit(3);");
  put('.env.local', 'A=use-only-value-123\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}
const put = (dir, args, input) => spawnSync(process.execPath, [cli, 'secret', 'put', ...args], { cwd: dir, encoding: 'utf8', input: input ?? '' });
const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });
const read = (dir, rel) => readFileSync(path.join(dir, rel), 'utf8');

test('a declared source writes the file with mode 0600, prints only the path and byte count, and never the value', () => {
  const dir = project();
  try {
    const r = put(dir, ['out/secret.txt', '--from-command', 'vault']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), `wrote out/secret.txt (${VALUE.length + 1} bytes)`);
    assert.ok(!r.stdout.includes(VALUE) && !r.stderr.includes(VALUE));
    assert.equal(read(dir, 'out/secret.txt'), `${VALUE}\n`);
    assert.equal(statSync(path.join(dir, 'out/secret.txt')).mode & 0o777, 0o600);
    assert.deepEqual(readdirSync(path.join(dir, 'out')), ['secret.txt'], 'no temporary file is left');
  } finally {
    cleanup(dir);
  }
});

test('stdin writes the file the same way', () => {
  const dir = project();
  try {
    const r = put(dir, ['.env.generated', '--stdin'], `TOKEN=${VALUE}\n`);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(read(dir, '.env.generated'), `TOKEN=${VALUE}\n`);
    assert.equal(statSync(path.join(dir, '.env.generated')).mode & 0o777, 0o600);
    assert.ok(!r.stdout.includes(VALUE));
  } finally {
    cleanup(dir);
  }
});

test('an existing file is replaced atomically, and a failing or empty source leaves it as it was', () => {
  const dir = project();
  try {
    mkdirSync(path.join(dir, 'out'), { recursive: true });
    writeFileSync(path.join(dir, 'out/secret.txt'), 'old\n');
    for (const [source, message] of [['broken', /the source failed \(exit 3\): item not found in vault/], ['empty', /produced no value/], ['missing', /cannot run the source|the source failed/]]) {
      const r = put(dir, ['out/secret.txt', '--from-command', source]);
      assert.equal(r.status, 1, source);
      assert.match(r.stderr, message, source);
      assert.equal(read(dir, 'out/secret.txt'), 'old\n', `${source}: the file is untouched`);
    }
    assert.equal(put(dir, ['out/secret.txt', '--from-command', 'vault']).status, 0);
    assert.equal(read(dir, 'out/secret.txt'), `${VALUE}\n`);
    assert.deepEqual(readdirSync(path.join(dir, 'out')), ['secret.txt']);
  } finally {
    cleanup(dir);
  }
});

test('refusals: not a sink path, a use path, an undeclared source, none declared, outside the project, through a symlink, a directory', () => {
  const dir = project();
  const none = project({ sources: '' });
  const outside = mkdtempSync(path.join(tmpdir(), 'gg-secret-put-outside-'));
  try {
    mkdirSync(path.join(dir, 'out'), { recursive: true });
    symlinkSync(outside, path.join(dir, 'out/link'));
    const cases = [
      [dir, ['README.md', '--from-command', 'vault'], /not a sink path/],
      [dir, ['.env.local', '--from-command', 'vault'], /not a sink path \(its mode is use\)/],
      [dir, ['out/secret.txt', '--from-command', 'nonexistent'], /"nonexistent" is not a source declared.*declared: "vault", "empty", "broken", "missing"/],
      [none, ['out/secret.txt', '--from-command', 'vault'], /no source is declared/],
      [dir, [path.join(outside, 'x.txt'), '--from-command', 'vault'], /outside the project/],
      [dir, ['../x.txt', '--from-command', 'vault'], /outside the project/],
      [dir, ['out/link/secret.txt', '--stdin'], /symbolic link/],
      [dir, ['out', '--stdin'], /not a sink path|is a directory/],
    ];
    for (const [d, args, message] of cases) {
      const r = put(d, args, VALUE);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, message, args.join(' '));
      assert.ok(!r.stderr.includes(VALUE) && !r.stdout.includes(VALUE));
    }
    assert.deepEqual(readdirSync(outside), [], 'nothing was written outside the project');
    assert.equal(existsSync(path.join(dir, 'out/secret.txt')), false);
  } finally {
    cleanup(dir);
    cleanup(none);
    cleanup(outside);
  }
});

test('the command text is never an argument: --from-command takes a declared name only', () => {
  const dir = project();
  try {
    const r = put(dir, ['out/secret.txt', '--from-command', 'node emit.js']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /is not a source declared/);
    assert.equal(existsSync(path.join(dir, 'out/secret.txt')), false);
  } finally {
    cleanup(dir);
  }
});

test('bad usage exits 2 with the usage line', () => {
  const dir = project();
  try {
    for (const args of [[], ['--stdin'], ['out/secret.txt'], ['out/secret.txt', '--stdin', '--from-command', 'vault'], ['out/secret.txt', '--from-command'], ['out/secret.txt', '--force']]) {
      const r = put(dir, args);
      assert.equal(r.status, 2, args.join(' '));
      assert.match(r.stderr, /usage: go-getter secret put/);
    }
    assert.equal(spawnSync(process.execPath, [cli, 'secret'], { cwd: dir, encoding: 'utf8' }).status, 2);
  } finally {
    cleanup(dir);
  }
});

test('parent directories are created inside the project, with an owner-only directory', () => {
  const dir = project({ modes: 'sink:deep/er/secret.txt', sources: 'deep/er/secret.txt|vault|node emit.js' });
  try {
    writeFileSync(path.join(dir, 'docs/guardrails/restricted.md'), guardrail('deep/er/secret.txt'));
    const r = put(dir, ['deep/er/secret.txt', '--from-command', 'vault']);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(read(dir, 'deep/er/secret.txt'), `${VALUE}\n`);
    assert.equal(statSync(path.join(dir, 'deep/er')).mode & 0o777, 0o700);
  } finally {
    cleanup(dir);
  }
});

test('telemetry records the event and its outcome, never a value, a path or a source', () => {
  const dir = project({ extra: { 'telemetry-recording': 'metadata-log', 'telemetry-retention-days': '30' } });
  try {
    put(dir, ['out/secret.txt', '--from-command', 'vault']);
    put(dir, ['README.md', '--from-command', 'vault']);
    const log = read(dir, STATE_LOG);
    const lines = log.trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(lines.map((l) => [l.event, l.outcome]), [['secret-put', 'pass'], ['secret-put', 'blocked']]);
    for (const needle of [VALUE, 'out/secret.txt', 'vault', 'emit.js']) assert.ok(!log.includes(needle), needle);
  } finally {
    cleanup(dir);
  }
});

test('sink-sources entries are read as pattern, name and command, and a command may contain a bar', () => {
  const dir = project({ sources: 'a/*.txt|one|node a.js, b.env|two|op read op://v/i|x, broken entry, |x|y' });
  try {
    assert.deepEqual(sinkSources(dir), [{ pattern: 'a/*.txt', name: 'one', command: 'node a.js' }, { pattern: 'b.env', name: 'two', command: 'op read op://v/i|x' }]);
  } finally {
    cleanup(dir);
  }
});
