import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const ENV = ['', 'env'].join('.');
const ENV_LOCAL = `${ENV}.local`;
const decision = `---\nid: 0001-secrets\ntitle: Secrets\nstatus: active\ndate: 2026-10-10\ntags: [guardrail]\ntrack: process\ngo-getter:\n  restricted-modes: "use:${ENV_LOCAL}"\n---\n\nx\n`;
const guardrail = `---\nid: restricted\ntitle: restricted\nstatus: active\ndate: 2026-10-10\ntags: [guardrail]\ngoverned-by: 0001-secrets\ngrounded-in: [0001-secrets]\nderivation-note: x\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "denied"\n      run: "builtin:deny-path paths=\\"${ENV},${ENV_LOCAL}\\""\n    - tier: 1\n      check: "instruction"\n---\n\n## Guardrail\n\nAdvisory.\n`;

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-sandbox-'));
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  };
  put('AGENTS.md', '# P\n');
  put('docs/guardrails/restricted.md', guardrail);
  put('docs/decisions/0001-secrets.md', decision);
  put(ENV, 'API_TOKEN=notallowedvalue123\n');
  put(ENV_LOCAL, 'DB_PASSWORD=Zx81Zx81Zx81Zx81\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}
const sandbox = (dir, ...args) => spawnSync(process.execPath, [cli, 'sandbox', ...args], { cwd: dir, encoding: 'utf8' });
const withProject = (fn) => () => {
  const dir = project();
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('prints a snippet per documented host and says so for hosts without a lever', withProject((dir) => {
  const r = sandbox(dir);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /claude-code: credentials-deny .*\[confirmed, fact 0027\]/);
  assert.ok(r.stdout.includes(`"file": "${ENV}"`));
  assert.match(r.stdout, /claude-code: credentials-mask [^\n]*\n\{[^]*"\.env\.local"/);
  assert.match(r.stdout, /codex: profile-deny-glob[^]*"\.env" = "deny"/);
  assert.match(r.stdout, /gemini-cli: env-redaction[^]*"API_TOKEN"/);
  assert.match(r.stdout, /copilot: secret-env-vars [^\n]*\n--secret-env-vars=API_TOKEN,DB_PASSWORD/);
  for (const host of ['cursor', 'kilo', 'opencode']) assert.match(r.stdout, new RegExp(`${host}: no credential lever`));
  assert.doesNotMatch(r.stdout, /notallowedvalue123|Zx81Zx81/);
}));

test('marks lines the facts leave unconfirmed', withProject((dir) => {
  const r = sandbox(dir);
  assert.match(r.stdout, /codex: profile-deny-glob [^\n]*\[not confirmed, fact 0031\]/);
  assert.match(r.stdout, /gemini-cli: env-redaction [^\n]*\[not confirmed, fact 0031\]/);
}));

test('--host filters, and an unknown host is refused', withProject((dir) => {
  const r = sandbox(dir, '--host', 'copilot');
  assert.match(r.stdout, /copilot:/);
  assert.doesNotMatch(r.stdout, /claude-code|codex|gemini-cli/);
  assert.equal(sandbox(dir, '--host', 'nope').status, 2);
  assert.match(sandbox(dir, '--host', 'kilo').stdout, /^kilo: no credential lever/);
}));

test('writes no file', withProject((dir) => {
  const before = readdirSync(dir, { recursive: true }).sort();
  sandbox(dir);
  assert.deepEqual(readdirSync(dir, { recursive: true }).sort(), before);
}));
