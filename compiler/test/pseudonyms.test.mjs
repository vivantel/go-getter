import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, statSync, utimesSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createPseudonymizer, cleanupSession, sweepPseudonyms, PSEUDONYM_DIR, MAX_AGE_MS } from '../src/secrets/pseudonyms.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const dirOf = (project) => path.join(project, PSEUDONYM_DIR);
const files = (project) => readdirSync(dirOf(project)).filter((f) => f.endsWith('.json'));
const names = (project, key, list) => {
  const p = createPseudonymizer(project, key);
  try {
    return list.map(([kind, value]) => p.name(kind, value));
  } finally {
    p.close();
  }
};
const temp = () => mkdtempSync(path.join(tmpdir(), 'gg-pseudo-'));

test('the same value keeps its name, a new one takes the next number, and kinds count apart', () => {
  const dir = temp();
  try {
    assert.deepEqual(names(dir, 's1', [['email', 'alice@example.com'], ['email', 'bob@example.com'], ['email', 'alice@example.com'], ['card', '4111111111111111']]), ['[email-1]', '[email-2]', '[email-1]', '[card-1]']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('names persist across calls, and another session starts again at 1', () => {
  const dir = temp();
  try {
    names(dir, 's1', [['email', 'alice@example.com'], ['email', 'bob@example.com']]);
    assert.deepEqual(names(dir, 's1', [['email', 'bob@example.com'], ['email', 'carol@example.com']]), ['[email-2]', '[email-3]']);
    assert.deepEqual(names(dir, 's2', [['email', 'carol@example.com']]), ['[email-1]']);
    assert.equal(files(dir).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the file holds salted hashes and never a value, with owner-only modes', () => {
  const dir = temp();
  try {
    names(dir, 's1', [['email', 'alice@example.com'], ['iban', 'GB82WEST12345698765432']]);
    const file = path.join(dirOf(dir), files(dir)[0]);
    const text = readFileSync(file, 'utf8');
    assert.ok(!text.includes('alice') && !text.includes('example.com') && !text.includes('GB82'), 'no value in the file');
    const data = JSON.parse(text);
    assert.match(data.salt, /^[0-9a-f]{32}$/);
    assert.deepEqual(Object.keys(data.maps).sort(), ['email', 'iban']);
    assert.ok(Object.keys(data.maps.email)[0].match(/^[0-9a-f]{64}$/));
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(statSync(dirOf(dir)).mode & 0o777, 0o700);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the same value gets different hashes in different sessions (a per-session salt)', () => {
  const dir = temp();
  try {
    names(dir, 's1', [['email', 'alice@example.com']]);
    names(dir, 's2', [['email', 'alice@example.com']]);
    const hashes = files(dir).map((f) => Object.keys(JSON.parse(readFileSync(path.join(dirOf(dir), f), 'utf8')).maps.email)[0]);
    assert.notEqual(hashes[0], hashes[1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a session key can never name a path', () => {
  const dir = temp();
  try {
    names(dir, '../../../../etc/passwd', [['email', 'a@example.com']]);
    assert.equal(files(dir).length, 1);
    assert.match(files(dir)[0], /^[0-9a-f]{32}\.json$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cleanup deletes a session map; a sweep deletes only maps untouched for 24 hours', () => {
  const dir = temp();
  try {
    names(dir, 'keep', [['email', 'a@example.com']]);
    names(dir, 'old', [['email', 'b@example.com']]);
    names(dir, 'gone', [['email', 'c@example.com']]);
    cleanupSession(dir, 'gone');
    assert.equal(files(dir).length, 2);
    const oldFile = files(dir).map((f) => path.join(dirOf(dir), f)).find((f) => JSON.parse(readFileSync(f, 'utf8')).maps.email);
    const old = new Date(Date.now() - MAX_AGE_MS - 60_000);
    // Age the second-created file only.
    const [first, second] = files(dir).map((f) => path.join(dirOf(dir), f));
    utimesSync(second, old, old);
    assert.equal(sweepPseudonyms(dir), 1);
    assert.equal(files(dir).length, 1);
    assert.ok(existsSync(first) || existsSync(second));
    assert.equal(sweepPseudonyms(dir), 0);
    assert.ok(oldFile);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a sweep of a project with no map directory is a no-op', () => {
  const dir = temp();
  try {
    assert.equal(sweepPseudonyms(dir), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('parallel hook processes in one session never hand out the same number', async () => {
  const dir = temp();
  const script = `import('${path.join(here, '../src/secrets/pseudonyms.mjs').replace(/\\/g, '/')}').then((m) => { const p = m.createPseudonymizer(process.argv[1], 's1'); process.stdout.write(p.name('email', process.argv[2])); p.close(); });`;
  const run = (value) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', script, dir, value], { stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      child.stdout.on('data', (d) => (out += d));
      child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`exit ${code}`))));
    });
  try {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => run(`user${i}@example.com`)));
    assert.equal(new Set(results).size, 8, `distinct names: ${results.join(' ')}`);
    assert.deepEqual([...results].sort(), Array.from({ length: 8 }, (_, i) => `[email-${i + 1}]`).sort());
    const map = JSON.parse(readFileSync(path.join(dirOf(dir), files(dir)[0]), 'utf8')).maps.email;
    assert.equal(Object.keys(map).length, 8);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
