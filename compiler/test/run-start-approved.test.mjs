// Decision 0186: an agent may start a run on an approved plan; the record is plan approval + run-grants, nothing wider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { activeRun, runsFile } from '../src/runs/record.mjs';
import { evaluatePreTool } from '../src/hook.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const body = '### 1 First — [ ]\nIssue: #1\nClass: implement · Effort: low · Needs: none · Check: `true`\nDo: a.\nDone-when: a.\n';
const plan = (approval) => `# P — plan\n\n**Status legend**: x\n${approval ? `**Approval**: ${approval}\n` : ''}\n${body}`;

function setup() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-start-')));
  const dir = path.join(base, 'proj');
  mkdirSync(path.join(dir, 'docs/plans'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/plans/ok.md'), plan('approved 2026-11-04 by Owner'));
  writeFileSync(path.join(dir, 'docs/plans/pending.md'), plan('pending'));
  writeFileSync(path.join(dir, 'docs/plans/none.md'), plan(''));
  writeFileSync(path.join(dir, 'ok.md'), plan('approved 2026-11-04 by Owner'));
  writeFileSync(path.join(dir, 'docs/decisions/0001-g.md'), '---\nid: 0001-g\ntitle: g\nstatus: active\ndate: 2026-10-05\ntags: [roadmap]\ngo-getter:\n  run-grants: git-push, pr-create\n---\n\n## Decision\n\nx\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Owner'], { cwd: dir });
  const bin = path.join(base, 'bin');
  mkdirSync(bin);
  symlinkSync(cli, path.join(bin, 'go-getter'));
  const env = { ...process.env, GO_GETTER_HOME: path.join(base, 'home') };
  const saved = { PATH: process.env.PATH, GO_GETTER_HOME: process.env.GO_GETTER_HOME };
  process.env.PATH = `${bin}${path.delimiter}${saved.PATH}`;
  process.env.GO_GETTER_HOME = env.GO_GETTER_HOME;
  return {
    dir, env,
    cli: (...args) => spawnSync(process.execPath, [cli, ...args], { cwd: dir, env, encoding: 'utf8' }),
    ask: (command, host = 'claude-code') => evaluatePreTool(dir, { tool_name: 'Bash', tool_input: { command } }, host),
    cleanup: () => {
      for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
      rmSync(base, { recursive: true, force: true });
    },
  };
}

test('an agent starts a run on an approved plan, on every host, with only --through and --hours', () => {
  const s = setup();
  try {
    for (const host of ['claude-code', 'codex', 'cursor', 'gemini-cli', 'copilot', 'opencode', 'kilo', undefined]) {
      for (const c of ['go-getter run start docs/plans/ok.md', 'go-getter run start docs/plans/ok.md --through 1 --hours 2', `node ${cli} run start docs/plans/ok.md`, 'npx go-getter run start docs/plans/ok.md']) {
        assert.ok(!s.ask(c, host).deny, `${host}: ${c}`);
      }
    }
  } finally { s.cleanup(); }
});

test('an agent start is denied for an unapproved plan, --grant, chains, other flags and plans outside docs/plans, saying what the person does', () => {
  const s = setup();
  try {
    const cases = {
      'go-getter run start docs/plans/pending.md': /go-getter plan approve pending\.md/,
      'go-getter run start docs/plans/none.md': /no Approval line.*go-getter plan approve none\.md/,
      'go-getter run start docs/plans/ok.md --grant pr-merge': /--grant/,
      'go-getter run start --grant=pr-merge docs/plans/ok.md': /--grant=pr-merge/,
      'go-getter run start docs/plans/ok.md --bogus': /--bogus/,
      'go-getter run start docs/plans/ok.md && echo x': /one plain command/,
      'true; go-getter run start docs/plans/ok.md': /one plain command/,
      'go-getter run start docs/plans/ok.md > /tmp/x': /one plain command/,
      'go-getter run start "docs/plans/ok.md"': /one plain command/,
      'go-getter run start ok.md': /docs\/plans/,
      'go-getter run start ../ok.md': /docs\/plans/,
      'go-getter run start docs/plans/missing.md': /docs\/plans/,
      'go-getter run start docs/plans/ok.md --hours': /needs a value/,
      'go-getter run start docs/plans/ok.md --hours 0': /needs a value/,
      'go-getter watch -- go-getter run start docs/plans/ok.md': /./,
      'go-getter run end': /a person runs it/,
    };
    for (const [c, re] of Object.entries(cases)) {
      const d = s.ask(c);
      assert.equal(d.deny, true, c);
      assert.match(d.reason, re, c);
    }
  } finally { s.cleanup(); }
});

test('human-only verbs stay denied, however go-getter is spelled', () => {
  const s = setup();
  try {
    for (const c of ['go-getter plan approve docs/plans/none.md', `node ${cli} plan approve`, 'npx go-getter plan approve x.md', 'go-getter watch -- go-getter plan approve x.md', 'go-getter approvals allow pr-merge', `node ${cli} approvals add x`, 'go-getter watch --until done -- go-getter approvals revoke pr-merge', `node ${cli} run end`]) {
      assert.equal(s.ask(c).deny, true, c);
    }
    const store = path.dirname(runsFile(s.env));
    for (const tool of [{ tool_name: 'Write', tool_input: { file_path: `${store}/runs.json`, content: '{}' } }, { tool_name: 'Bash', tool_input: { command: `echo {} > ${store}/runs.json` } }]) {
      assert.equal(evaluatePreTool(s.dir, tool, 'claude-code').deny, true);
    }
  } finally { s.cleanup(); }
});

test('the record holds the plan approval and the run-grants answer, nothing wider; the CLI refuses a pending plan', () => {
  const s = setup();
  try {
    assert.equal(s.cli('run', 'start', 'docs/plans/pending.md').status, 1);
    assert.equal(activeRun(s.dir, { env: s.env }), null);
    const r = s.cli('run', 'start', 'docs/plans/ok.md');
    assert.equal(r.status, 0, r.stderr);
    const rec = activeRun(s.dir, { env: s.env });
    assert.deepEqual(rec.grants, ['git-push', 'pr-create']);
    assert.equal(rec.approval, 'approved 2026-11-04 by Owner');
    assert.equal(rec.plan, 'docs/plans/ok.md');
    assert.ok(Date.parse(rec.timeoutAt) - Date.parse(rec.startedAt) <= 8 * 3600_000 + 1000, 'default time limit');
  } finally { s.cleanup(); }
});

test('a start is refused without a usable time limit and with an unbound spend cap', () => {
  const s = setup();
  try {
    assert.equal(s.cli('run', 'start', 'docs/plans/ok.md', '--hours', '0').status, 1);
    assert.equal(s.cli('run', 'start', 'docs/plans/ok.md', '--hours', '100').status, 1);
    writeFileSync(path.join(s.dir, 'docs/decisions/0002-c.md'), '---\nid: 0002-c\ntitle: c\nstatus: active\ndate: 2026-10-05\ntags: [roadmap]\ngo-getter:\n  routing-start-tiers: {implement: small}\n  headless-spend-cap-usd: "5"\n---\n\n## Decision\n\nx\n');
    const r = s.cli('run', 'start', 'docs/plans/ok.md');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /telemetry recording is off/);
    assert.equal(activeRun(s.dir, { env: s.env }), null);
  } finally { s.cleanup(); }
});

test('plan approve adds the Approval line to an existing plan that has none, and is idempotent', () => {
  const s = setup();
  try {
    const r = s.cli('plan', 'approve', 'docs/plans/none.md');
    assert.equal(r.status, 0, r.stderr);
    const text = readFileSync(path.join(s.dir, 'docs/plans/none.md'), 'utf8');
    assert.match(text, /^\*\*Approval\*\*: approved \d{4}-\d\d-\d\d by Owner$/m);
    assert.match(text, /\*\*Status legend\*\*: x\n\*\*Approval\*\*/);
    assert.match(s.cli('plan', 'approve', 'docs/plans/none.md').stdout, /already approved/);
    assert.ok(!s.ask('go-getter run start docs/plans/none.md').deny, 'an agent may now start it');
  } finally { s.cleanup(); }
});
