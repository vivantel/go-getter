import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const module = pathToFileURL(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/secrets/approvals.mjs')).href;

const slowLock = fileURLToPath(new URL('./support/slow-lock.mjs', import.meta.url));

function child(env, code, preload = []) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [...preload, '--input-type=module', '-e', `import * as a from ${JSON.stringify(module)};\n${code}`], { env, stdio: 'ignore' });
    p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error(`child exited ${c}`))));
  });
}

test('20 parallel store writers lose no write and a revoke is not lost', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'gg-lock-home-'));
  const project = mkdtempSync(path.join(tmpdir(), 'gg-lock-proj-'));
  const env = { ...process.env, GO_GETTER_HOME: home, PROJECT: project };
  await child(env, 'a.addShape(process.env.PROJECT, "stale-shape");');
  const runs = [child(env, 'a.revokeShape(process.env.PROJECT, { id: "stale-shape" });')];
  for (let i = 0; i < 20; i++) runs.push(child(env, `a.addShape(process.env.PROJECT, "shape-${i}");`));
  await Promise.all(runs);
  const ids = new Set(JSON.parse(JSON.stringify(await listIds(env, project))));
  for (let i = 0; i < 20; i++) assert.ok(ids.has(`shape-${i}`), `shape-${i} was lost`);
  assert.ok(!ids.has('stale-shape'), 'the revoke was lost');
});

async function listIds(env, project) {
  const a = await import(module);
  return a.listShapes(project, env).map((e) => e.id);
}

test('processes racing to take over a stale lock lose no write', async () => {
  const { mkdirSync, writeFileSync, utimesSync } = await import('node:fs');
  for (let round = 0; round < 3; round++) {
    const home = mkdtempSync(path.join(tmpdir(), 'gg-lock-stale-'));
    const project = mkdtempSync(path.join(tmpdir(), 'gg-lock-stale-proj-'));
    const env = { ...process.env, GO_GETTER_HOME: home, PROJECT: project };
    mkdirSync(home, { recursive: true });
    const lock = path.join(home, 'store.lock');
    writeFileSync(lock, '');
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    await Promise.all([0, 1, 2, 3].map((i) => child(env, `a.addShape(process.env.PROJECT, "racer-${i}");`, ['--import', slowLock])));
    const ids = new Set(await listIds(env, project));
    for (let i = 0; i < 4; i++) assert.ok(ids.has(`racer-${i}`), `round ${round}: racer-${i} was lost`);
  }
});
