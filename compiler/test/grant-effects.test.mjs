// Effect classes and caps in grants (discovery-and-outcomes D5, decision 0180): `go-getter act` checks the cap, logs metadata and then calls the tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cleanGitEnv } from '../src/git-env.mjs';
import { ledgerView, releaseUnit } from '../src/work/ops.mjs';
import { issueGrant } from '../src/work/grant-ops.mjs';
import { parseEffects } from '../src/work/effects.mjs';
import { act } from '../src/act.mjs';
import { evaluatePreTool } from '../src/hook.mjs';
import { effectVerbCoverage } from '../src/coverage.mjs';
import { loadCapabilities } from '../src/capabilities.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(repoRoot, 'compiler/bin/go-getter.mjs');
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
const tmp = () => realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-effects-')));
const T0 = new Date('2026-11-05T09:00:00.000Z');
const opts = { now: T0 };

const PLAN = `# Feature
Owner-id: dana

## Phase
Id: P
Scope: src/**

### S1 One — [ ]
Class: implement · Needs: none · Scope: src/a/** · Check: \`true\`
Do: change the a module.

### S2 Two — [ ]
Class: implement · Needs: none · Scope: src/b/** · Check: \`true\`
Do: change the b module.
`;
const WORKERS = '# Workers\n\n| id | tracker | kind | tags |\n| --- | --- | --- | --- |\n| dana | dana-gh | human | owner |\n| bot | - | agent | code |\n';
const EFFECTS = `# Effects

| action | class | tool |
| --- | --- | --- |
| pay-vendor | money | pay-cli |
| open-valve | physical | valve-ctl |
| sign-nda | legal | sign-tool |
| notify | reversible | notify-cli |
| odd | telepathy | mind-tool |
`;
const dana = { kind: 'human', id: 'dana' };
const bot = { kind: 'agent', id: 'bot' };

const ROOT = { scope: ['src/**'], spend: 100, shapes: ['git-push'], asks: 'default-reversible', data: ['public'], effects: { reversible: true, money: { amount: 50, period: 'day' }, physical: ['zoneA', 'zoneB'], legal: ['nda@acme'] } };
const CHILD = { ...ROOT, scope: ['src/a/**'], effects: { reversible: true, money: { amount: 30, period: 'day' }, physical: ['zoneA'], legal: ['nda@acme'] } };

function world() {
  const base = tmp();
  const bare = path.join(base, 'remote.git');
  sh(base, 'init', '--bare', '-b', 'main', bare);
  const seed = path.join(base, 'seed');
  sh(base, 'init', '-b', 'main', seed);
  sh(seed, 'config', 'user.name', 'seed');
  sh(seed, 'config', 'user.email', 'seed@example.test');
  mkdirSync(path.join(seed, 'docs/plans'), { recursive: true });
  writeFileSync(path.join(seed, 'docs/plans/feat.md'), PLAN);
  writeFileSync(path.join(seed, 'docs/workers.md'), WORKERS);
  writeFileSync(path.join(seed, 'docs/effects.md'), EFFECTS);
  sh(seed, 'add', '-A');
  sh(seed, 'commit', '-m', 'seed');
  sh(seed, 'remote', 'add', 'origin', bare);
  sh(seed, 'push', 'origin', 'main');
  const dir = path.join(base, 'a');
  sh(base, 'clone', bare, dir);
  sh(dir, 'config', 'user.name', 'a');
  sh(dir, 'config', 'user.email', 'a@example.test');
  return dir;
}
async function granted() {
  const dir = world();
  assert.ok((await issueGrant(dir, 'feat#P', dana, { ...opts, grant: ROOT })).ok);
  assert.ok((await issueGrant(dir, 'feat#S1', dana, { ...opts, grant: CHILD, to: bot })).ok);
  return dir;
}
const unitOf = (dir, unit) => ledgerView(dir, 'feat', { now: T0, remote: 'origin' }).entries.find((e) => e.unit === unit);
const stub = () => {
  const calls = [];
  return { calls, run: (words) => calls.push(words) };
};
const go = (dir, ...args) => {
  try {
    return { code: 0, out: execFileSync(process.execPath, [cli, ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...cleanGitEnv(process.env), CI: '', GO_GETTER_WORKER: 'bot', GO_GETTER_WORKER_KIND: 'agent' } }) };
  } catch (e) {
    return { code: e.status, out: `${e.stdout}${e.stderr}` };
  }
};

test('the action map reads its rows and drops one with an unknown class', () => {
  const rows = parseEffects(EFFECTS);
  assert.deepEqual(rows.map((r) => r.action), ['pay-vendor', 'open-valve', 'sign-nda', 'notify']);
  assert.equal(rows[0].tool, 'pay-cli');
});

test('a capped money effect is allowed inside the cap, logged as metadata, and parked above it', async () => {
  const dir = await granted();
  const t = stub();
  const ok = await act(dir, 'pay-vendor', { unit: 'feat#S1', who: bot, amount: 25, currency: 'EUR', toolArgs: ['--invoice', '77'], ...opts, run: t.run });
  assert.ok(ok.ok, ok.error);
  assert.deepEqual(t.calls, [['pay-cli', '--invoice', '77']]);
  const rec = unitOf(dir, 'feat#S1').effected;
  assert.equal(rec.length, 1);
  assert.deepEqual(Object.keys(rec[0]).sort(), ['action', 'amount', 'at', 'class', 'currency', 'holder', 'unit']);
  assert.equal(rec[0].amount, 25);
  assert.doesNotMatch(JSON.stringify(rec), /invoice|77/, 'the tool arguments are content and are not logged');
  const over = await act(dir, 'pay-vendor', { unit: 'feat#S1', who: bot, amount: 10, currency: 'EUR', ...opts, run: t.run });
  assert.equal(over.ok, false);
  assert.equal(over.code, 'effect-cap');
  assert.equal(t.calls.length, 1, 'the tool was not called');
  const e = unitOf(dir, 'feat#S1');
  assert.equal(e.state, 'parked');
  assert.equal(e.ask.kind, 'spend');
  assert.equal(e.effected.length, 1);
});

test('a release and re-claim keeps the logged effects, so the money cap is not reset', async () => {
  const dir = await granted();
  const t = stub();
  assert.ok((await act(dir, 'pay-vendor', { unit: 'feat#S1', who: bot, amount: 25, currency: 'EUR', ...opts, run: t.run })).ok);
  const rel = await releaseUnit(dir, 'feat#S1', bot, { ...opts, remote: 'origin' });
  assert.ok(rel.ok, rel.error);
  const again = await issueGrant(dir, 'feat#S1', dana, { ...opts, grant: CHILD, to: bot });
  assert.ok(again.ok, again.error);
  assert.equal(unitOf(dir, 'feat#S1').effected?.length, 1, 'the earlier effect is still on the entry');
  const over = await act(dir, 'pay-vendor', { unit: 'feat#S1', who: bot, amount: 10, currency: 'EUR', ...opts, run: t.run });
  assert.equal(over.code, 'effect-cap', 'the 25 already spent still counts against the 30 cap');
});

test('an effect counts against an ancestor cap across its children', async () => {
  const dir = world();
  assert.ok((await issueGrant(dir, 'feat#P', dana, { ...opts, grant: { ...ROOT, effects: { ...ROOT.effects, money: { amount: 40, period: 'day' } } } })).ok);
  assert.ok((await issueGrant(dir, 'feat#S1', dana, { ...opts, grant: CHILD, to: bot })).ok);
  assert.ok((await issueGrant(dir, 'feat#S2', dana, { ...opts, grant: { ...CHILD, scope: ['src/b/**'] }, to: bot })).ok);
  const t = stub();
  assert.ok((await act(dir, 'pay-vendor', { unit: 'feat#S1', who: bot, amount: 25, ...opts, run: t.run })).ok);
  const over = await act(dir, 'pay-vendor', { unit: 'feat#S2', who: bot, amount: 20, ...opts, run: t.run });
  assert.equal(over.code, 'effect-cap');
  assert.equal(over.over.unit, 'feat#P');
});

test('a money effect older than the period no longer counts', async () => {
  const dir = await granted();
  const t = stub();
  assert.ok((await act(dir, 'pay-vendor', { unit: 'feat#S1', who: bot, amount: 30, ...opts, run: t.run })).ok);
  const next = new Date(T0.getTime() + 25 * 3_600_000);
  assert.ok((await act(dir, 'pay-vendor', { unit: 'feat#S1', who: bot, amount: 30, now: next, run: t.run })).ok);
});

test('a child cap wider than its parent is refused, per class', async () => {
  const dir = world();
  assert.ok((await issueGrant(dir, 'feat#P', dana, { ...opts, grant: ROOT })).ok);
  for (const effects of [{ money: { amount: 51, period: 'day' } }, { physical: ['zoneC'] }, { legal: ['msa@acme'] }]) {
    const r = await issueGrant(dir, 'feat#S1', dana, { ...opts, grant: { ...CHILD, effects }, to: bot });
    assert.equal(r.ok, false, JSON.stringify(effects));
    assert.equal(r.code, 'wider');
    assert.match(r.error, /effects/);
  }
});

test('an unmapped action, and one with an unknown class, is refused and nothing is called', async () => {
  const dir = await granted();
  const t = stub();
  for (const action of ['launch-missile', 'odd']) {
    const r = await act(dir, action, { unit: 'feat#S1', who: bot, amount: 1, ...opts, run: t.run });
    assert.equal(r.code, 'unknown-class');
    assert.match(r.error, /class is unknown/);
  }
  assert.equal(t.calls.length, 0);
  assert.equal(unitOf(dir, 'feat#S1').effected, undefined);
});

test('physical and legal caps are checked the same way: inside logs, outside parks', async () => {
  const dir = await granted();
  const t = stub();
  const zone = await act(dir, 'open-valve', { unit: 'feat#S1', who: bot, zone: 'zoneA', ...opts, run: t.run });
  assert.ok(zone.ok, zone.error);
  assert.equal(unitOf(dir, 'feat#S1').effected.at(-1).zone, 'zoneA');
  const legal = await act(dir, 'sign-nda', { unit: 'feat#S1', who: bot, contract: 'nda', counterparty: 'acme', ...opts, run: t.run });
  assert.ok(legal.ok, legal.error);
  assert.deepEqual([unitOf(dir, 'feat#S1').effected.at(-1).contract, unitOf(dir, 'feat#S1').effected.at(-1).counterparty], ['nda', 'acme']);
  const outside = await act(dir, 'open-valve', { unit: 'feat#S1', who: bot, zone: 'zoneB', ...opts, run: t.run });
  assert.equal(outside.code, 'effect-cap');
  assert.match(outside.error, /outside the physical cap/);
  assert.equal(t.calls.length, 2);
});

test('a money effect without its amount is refused and calls nothing', async () => {
  const dir = world();
  const claim = await issueGrant(dir, 'feat#P', dana, { ...opts, grant: ROOT, to: bot });
  assert.ok(claim.ok, claim.error);
  const t = stub();
  assert.equal((await act(dir, 'pay-vendor', { unit: 'feat#P', who: bot, ...opts, run: t.run })).code, 'bad-effect');
  assert.equal(t.calls.length, 0);
});

test('go-getter act: refuses an unmapped action and a capped class above its cap, names the verb', async () => {
  const dir = await granted();
  let r = go(dir, 'act', 'launch-missile', '--unit', 'feat#S1');
  assert.equal(r.code, 1);
  assert.match(r.out, /not mapped in docs\/effects\.md/);
  r = go(dir, 'act', 'pay-vendor', '--unit', 'feat#S1', '--amount', '31', '--', 'true');
  assert.equal(r.code, 3, r.out);
  assert.match(r.out, /parked as an ask of class spend/);
  assert.equal(go(dir, 'act').code, 2);
});

const guardrail = readFileSync(path.join(repoRoot, 'docs/guardrails/a-real-world-effect-stays-inside-its-cap.md'), 'utf8');
function hookProject() {
  const dir = tmp();
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  writeFileSync(path.join(dir, 'docs/effects.md'), EFFECTS);
  writeFileSync(path.join(dir, 'docs/workers.md'), WORKERS);
  writeFileSync(path.join(dir, 'docs/guardrails/a-real-world-effect-stays-inside-its-cap.md'), guardrail);
  return dir;
}

test('the guardrail is active at tier 2 and the hook denies a raw effect tool, naming the verb', () => {
  assert.match(guardrail, /status: active/);
  assert.match(guardrail, /tier: 2/);
  const dir = hookProject();
  try {
    for (const command of ['pay-cli --invoice 77', 'cd app && /usr/local/bin/valve-ctl open', 'sh -c "sign-tool nda"']) {
      const d = evaluatePreTool(dir, { tool_name: 'Bash', tool_input: { command } }, 'claude-code');
      assert.equal(d.deny, true, command);
      assert.match(d.reason, /go-getter act /, command);
      assert.match(d.reason, /a-real-world-effect-stays-inside-its-cap/);
    }
    for (const command of ['go-getter act pay-vendor --unit feat#S1 --amount 5 -- pay-cli', 'echo pay-cli', 'npm test']) {
      assert.equal(evaluatePreTool(dir, { tool_name: 'Bash', tool_input: { command } }, 'claude-code').deny, false, command);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('coverage states which hosts and worker kinds have the verb as the sole path', () => {
  const dir = hookProject();
  try {
    const text = effectVerbCoverage(dir, loadCapabilities(repoRoot));
    assert.match(text, /sole path for agent workers on [a-z, -]*claude-code/);
    assert.match(text, /human workers: not the sole path/);
    assert.match(text, /ci workers: configured to call the verb.*\(none listed in the workers file\)/);
    rmSync(path.join(dir, 'docs/guardrails/a-real-world-effect-stays-inside-its-cap.md'));
    assert.equal(effectVerbCoverage(dir, loadCapabilities(repoRoot)), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
