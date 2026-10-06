import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadPack, loadPackSchema, validatePack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { planApply, writeApply, diffApply } from '../src/apply.mjs';
import { verifyConfig, checksFor, verify, evaluateStop, respondStop } from '../src/verify.mjs';
import { CHECKS } from '../src/detect.mjs';
import { readLog, LOG } from '../src/telemetry/record.mjs';
import { validateRecord } from '../src/telemetry/schema.mjs';
import { coverage } from '../src/coverage.mjs';
import { loadCapabilities } from '../src/capabilities.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = path.join(root, 'compiler/bin/go-getter.mjs');
const pack = loadPack(path.join(root, 'src/packs/verification-gate/pack.json'));
const telemetry = loadPack(path.join(root, 'src/packs/telemetry/pack.json'));
const STATE = path.join('.go-getter', 'state');
const PASS = 'node -e "process.exit(0)"';
// Fails with a message until the file ok.flag exists in the project.
const LINT = 'node -e "if (!require(\'fs\').existsSync(\'ok.flag\')) { console.error(\'lint exploded\'); process.exit(1) }"';

const answersFor = (overrides = {}) => ({
  checks: 'detected',
  'test-command': PASS,
  'lint-command': LINT,
  'typecheck-command': '',
  'review-bar': 'reviewer-verdict',
  gate: 'block',
  ...overrides,
});

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-verify-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nverification — x\nharness — x\nguardrail — x\nobservability — x\n');
  writeFileSync(path.join(dir, '.gitignore'), `${STATE}/\n`);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}
const adopt = (dir, answers = answersFor(), p = pack) => applyRender({ root: dir, plan: planRender({ root: dir, pack: p, answers, acceptedBy: 't', date: '2026-10-05' }) });
const adoptTelemetry = (dir) => adopt(dir, { recording: 'metadata-log', retention: '30', export: 'none' }, telemetry);
const dirty = (dir) => writeFileSync(path.join(dir, 'change.txt'), 'a change\n');
const fix = (dir) => writeFileSync(path.join(dir, 'ok.flag'), 'fixed\n');
const stop = (dir, host = 'claude-code', payload = {}) =>
  spawnSync('node', [bin, 'hook', 'stop', '--host', host, '--project', dir], { input: JSON.stringify({ session_id: 's1', ...payload }), encoding: 'utf8' });
const done = (dir) => rmSync(dir, { recursive: true, force: true });

test('the verification-gate pack is valid and covers component 6', () => {
  assert.deepEqual(validatePack(loadPackSchema(root), pack, { dirName: 'verification-gate' }), []);
  assert.deepEqual(pack.components, [6]);
});

test('command questions are prefilled from detected commands for every check of the catalog', () => {
  for (const check of CHECKS) assert.equal(pack.questions.find((x) => x.id === `${check}-command`).detect, `commands.${check}`);
});

const FAIL = 'node -e "process.exit(1)"';
const allCommands = Object.fromEntries(CHECKS.map((c) => [`${c}-command`, c === 'format' ? '' : ['build', 'e2e', 'integration', 'static-analysis'].includes(c) ? FAIL : PASS]));

test('a thin profile runs lint and typecheck locally but not build or e2e', async () => {
  const dir = project();
  adopt(dir, answersFor({ ...allCommands, 'machine-profile': 'thin' }));
  const config = verifyConfig(dir);
  assert.equal(config.profile, 'thin');
  assert.deepEqual(Object.keys(config.commands), ['lint', 'typecheck', 'test', 'unit']);
  assert.deepEqual(Object.keys(config.ci), ['static-analysis', 'build', 'test', 'unit', 'integration', 'e2e']);
  const { ok, results } = await verify(dir, 'implement');
  assert.equal(ok, true, 'the failing build and e2e commands are left to CI');
  assert.deepEqual(results.map((r) => r.name), ['lint', 'typecheck', 'test', 'unit']);
  done(dir);
});

test('a full profile runs every check locally and a ci-only profile none', async () => {
  for (const [profile, local, ci] of [
    ['full', ['lint', 'typecheck', 'static-analysis', 'build', 'test', 'unit', 'integration', 'e2e'], []],
    ['ci-only', [], ['lint', 'typecheck', 'static-analysis', 'build', 'test', 'unit', 'integration', 'e2e']],
  ]) {
    const dir = project();
    adopt(dir, answersFor({ ...allCommands, 'machine-profile': profile }));
    assert.deepEqual(Object.keys(verifyConfig(dir).commands), local, profile);
    assert.deepEqual(Object.keys(verifyConfig(dir).ci), ci, profile);
    dirty(dir);
    assert.equal((await evaluateStop(dir, {})).block, profile === 'full', `${profile}: the gate runs only local checks`);
    done(dir);
  }
});

test('an existing 0.1.0 answer file still renders with the same local checks', () => {
  const dir = project();
  const file = path.join(dir, 'answers.json');
  writeFileSync(file, JSON.stringify({ answers: { checks: 'detected', 'test-command': PASS, 'lint-command': LINT, 'typecheck-command': '', 'review-bar': 'reviewer-verdict', gate: 'block' }, acceptedBy: 't', date: '2026-10-05' }));
  const run = spawnSync('node', [bin, 'render-pack', 'verification-gate', '--answers', file, '--project', dir], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const config = verifyConfig(dir);
  assert.equal(config.profile, 'thin', 'a missing profile takes the recommended one');
  assert.deepEqual(config.commands, { lint: LINT, test: PASS });
  done(dir);
});

test('a gate adopted before the machine profile runs every check locally', () => {
  const dir = project();
  const v1 = { ...pack, version: '0.1.0', questions: pack.questions.filter((q) => !q.since) };
  adopt(dir, answersFor(), v1);
  const config = verifyConfig(dir);
  assert.equal(config.profile, null);
  assert.deepEqual(config.commands, { lint: LINT, test: PASS });
  assert.deepEqual(config.ci, {});
  done(dir);
});

test('every answer renders; command questions follow the checks scope', () => {
  for (const [checks, extra, expected] of [
    ['detected', { 'test-command': 't', 'lint-command': 'l', 'typecheck-command': 'c' }, ['test', 'lint', 'typecheck']],
    ['tests-only', { 'test-command': 't' }, ['test']],
    ['affected-tests', { 'affected-command': 'a' }, ['affected']],
  ]) {
    const dir = project();
    for (const review of ['reviewer-verdict', 'verdict-conform', 'none']) {
      for (const gate of ['block', 'report']) {
        const plan = planRender({ root: dir, pack, answers: { checks, ...extra, 'review-bar': review, gate }, acceptedBy: 't', date: '2026-10-05' });
        const slugs = plan.artifacts.map((a) => path.basename(a.path, '.md').replace(/^\d{4}-/, ''));
        for (const name of ['test', 'lint', 'typecheck', 'affected']) assert.equal(slugs.includes(`verification-${name}-command`), expected.includes(name), `${checks}: ${name}`);
        assert.ok(slugs.includes('verification-gate-blocks-done'));
      }
    }
    done(dir);
  }
});

test('the recommended gate adopts a tier-2 stop entry and reads back as configuration', () => {
  const dir = project();
  adopt(dir);
  assert.deepEqual(verifyConfig(dir), { adopted: true, scope: 'detected', profile: 'thin', commands: { lint: LINT, test: PASS }, ci: { test: PASS }, reviewBar: 'reviewer-verdict', gate: 'block', maxEscalations: 2 });
  const guardrail = readFileSync(path.join(dir, 'docs/guardrails/verification-gate-blocks-done.md'), 'utf8');
  assert.match(guardrail, /tier: 2/);
  assert.match(guardrail, /run: builtin:verify-gate/);
  done(dir);
});

test('nothing adopted means no checks and no gate', async () => {
  const dir = project();
  assert.deepEqual(verifyConfig(dir).commands, {});
  assert.equal(verifyConfig(dir).adopted, false);
  dirty(dir);
  assert.equal((await evaluateStop(dir, {})).block, false);
  done(dir);
});

test('the scope, review bar and gate answers change what each class runs', () => {
  const dir = project();
  adopt(dir, answersFor({ checks: 'tests-only', gate: 'report', 'review-bar': 'verdict-conform' }));
  const config = verifyConfig(dir);
  assert.deepEqual(config.commands, { test: PASS });
  assert.equal(config.gate, 'report');
  assert.deepEqual(checksFor(config, 'implement').map((c) => c.name), ['test']);
  assert.deepEqual(checksFor(config, 'debug').map((c) => c.name), ['test']);
  assert.deepEqual(checksFor(config, 'review').map((c) => c.name), ['guardrails']);
  assert.deepEqual(checksFor(config, 'explore'), []);
  assert.deepEqual(checksFor(config, 'plan'), []);
  done(dir);
  const other = project();
  adopt(other, { checks: 'affected-tests', 'affected-command': 'npm run test:affected', 'review-bar': 'none', gate: 'block' });
  assert.deepEqual(verifyConfig(other).commands, { test: 'npm run test:affected' });
  assert.deepEqual(checksFor(verifyConfig(other), 'review'), []);
  done(other);
});

test('verify runs one passing and one failing check, exits non-zero and records telemetry', () => {
  const dir = project();
  adopt(dir);
  adoptTelemetry(dir);
  const run = spawnSync('node', [bin, 'verify', '--class', 'implement', '--project', dir, '--host', 'claude-code'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /FAIL lint\npass test/);
  assert.match(run.stderr, /lint exploded/);
  const records = readLog(dir);
  assert.deepEqual(records.map((r) => [r.event, r.outcome, r.taskClass, r.host]), [
    ['verify:lint', 'fail', 'implement', 'claude-code'],
    ['verify:test', 'pass', 'implement', 'claude-code'],
  ]);
  for (const r of records) assert.deepEqual(validateRecord(r), []);
  assert.ok(!readFileSync(path.join(dir, LOG), 'utf8').includes('exploded'), 'check output is never recorded');
  done(dir);
});

test('verify exits 0 when every check passes or the class has none, and 2 on a bad class', () => {
  const dir = project();
  adopt(dir);
  fix(dir);
  const code = (cls) => spawnSync('node', [bin, 'verify', '--class', cls, '--project', dir], { encoding: 'utf8' });
  assert.equal(code('implement').status, 0);
  assert.equal(code('debug').status, 0);
  const none = code('explore');
  assert.equal(none.status, 0);
  assert.match(none.stdout, /no checks configured/);
  assert.equal(code('bogus').status, 2);
  done(dir);
});

test('the conform bar runs every tier-3 guardrail check for review steps', async () => {
  const dir = project();
  adopt(dir, answersFor({ 'review-bar': 'verdict-conform' }));
  writeFileSync(
    path.join(dir, 'docs/guardrails/needs-file.md'),
    '---\nid: needs-file\ntitle: needs file\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 3\n      check: file exists\n      run: builtin:path-exists path=missing.txt\n---\n\n## Guardrail\n\nx\n',
  );
  assert.equal((await verify(dir, 'review')).ok, false);
  writeFileSync(path.join(dir, 'missing.txt'), 'here\n');
  assert.equal((await verify(dir, 'review')).ok, true);
  done(dir);
});

test('the stop hook blocks on Claude Code input while checks fail and allows after a pass', () => {
  const dir = project();
  adopt(dir);
  adoptTelemetry(dir);
  dirty(dir);
  const blocked = stop(dir);
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /not done yet/);
  assert.match(blocked.stderr, /lint failed/);
  assert.match(blocked.stderr, /attempt 1 of 2/);
  fix(dir);
  const allowed = stop(dir);
  assert.equal(allowed.status, 0);
  assert.equal(allowed.stderr, '');
  assert.deepEqual(readLog(dir).filter((r) => r.event === 'verify:gate').map((r) => r.outcome), ['blocked']);
  done(dir);
});

test('the stop hook is bounded by the escalation limit, then hands over to a human', async () => {
  const dir = project();
  adopt(dir);
  adoptTelemetry(dir);
  dirty(dir);
  const outcomes = [];
  for (let i = 0; i < 4; i++) {
    const d = await evaluateStop(dir, { session_id: 's1' });
    outcomes.push(d.block ? 'block' : d.escalated ? 'escalated' : 'allow');
  }
  // two blocks, a hand-over, then the count starts afresh
  assert.deepEqual(outcomes, ['block', 'block', 'escalated', 'block']);
  const last = readLog(dir).filter((r) => r.event === 'verify:gate').map((r) => r.outcome);
  assert.deepEqual(last, ['blocked', 'blocked', 'escalated', 'blocked']);
  const escalated = respondStop('claude-code', { block: false, escalated: true, reason: 'handing over to a human' });
  assert.deepEqual(escalated, { code: 0, stdout: '', stderr: 'handing over to a human' });
  done(dir);
});

test('attempts are counted per session', async () => {
  const dir = project();
  adopt(dir);
  dirty(dir);
  assert.equal((await evaluateStop(dir, { session_id: 'a' })).block, true);
  assert.equal((await evaluateStop(dir, { session_id: 'a' })).block, true);
  assert.equal((await evaluateStop(dir, { session_id: 'b' })).block, true);
  assert.equal((await evaluateStop(dir, { session_id: 'a' })).escalated, true);
  done(dir);
});

test('the stop hook leaves a clean tree and a report-only gate alone', async () => {
  const clean = project();
  adopt(clean);
  execFileSync('git', ['add', '-A'], { cwd: clean });
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'adopt'], { cwd: clean });
  assert.equal((await evaluateStop(clean, {})).block, false, 'nothing changed, nothing to verify');
  done(clean);
  const report = project();
  adopt(report, answersFor({ gate: 'report' }));
  dirty(report);
  assert.equal((await evaluateStop(report, {})).block, false);
  done(report);
});

test('hosts answer a blocked stop in their own format', () => {
  const decision = { block: true, reason: 'fix lint' };
  assert.deepEqual(respondStop('claude-code', decision), { code: 2, stdout: '', stderr: 'fix lint' });
  assert.deepEqual(respondStop('codex', decision), { code: 2, stdout: '', stderr: 'fix lint' });
  assert.deepEqual(respondStop('gemini-cli', decision), { code: 2, stdout: '', stderr: 'fix lint' });
  assert.deepEqual(respondStop('cursor', decision), { code: 0, stdout: JSON.stringify({ followup_message: 'fix lint' }), stderr: '' });
  assert.deepEqual(respondStop('claude-code', { block: false }), { code: 0, stdout: '', stderr: '' });
});

test('the stop hook answers a Cursor payload with a follow-up message', () => {
  const dir = project();
  adopt(dir);
  dirty(dir);
  const run = stop(dir, 'cursor', { conversation_id: 'c1' });
  assert.equal(run.status, 0);
  assert.match(JSON.parse(run.stdout).followup_message, /lint failed/);
  done(dir);
});

test('a malformed payload or an unknown project never traps the session', () => {
  const dir = project();
  const run = spawnSync('node', [bin, 'hook', 'stop', '--host', 'claude-code', '--project', dir], { input: 'not json', encoding: 'utf8' });
  assert.equal(run.status, 0);
  done(dir);
});

test('apply installs the stop hook only on hosts that can block a stop, and only with the gate', () => {
  const dir = project();
  adopt(dir);
  const hosts = ['claude-code', 'codex', 'gemini-cli', 'cursor', 'copilot', 'kilo', 'opencode'];
  const plan = planApply(dir, { hosts });
  const out = (rel) => JSON.parse(plan.outputs[rel].content);
  assert.ok(out('.claude/settings.json').hooks.Stop[0].hooks[0].command.endsWith('hook stop --host claude-code --project "$d"\''));
  assert.ok(out('.codex/hooks.json').hooks.Stop[0].hooks[0].command.endsWith('hook stop --host codex --project "$d"\''));
  assert.ok(out('.gemini/settings.json').hooks.AfterAgent[0].hooks[0].command.endsWith('hook stop --host gemini-cli --project "$d"\''));
  assert.ok(out('.cursor/hooks.json').hooks.stop[0].command.endsWith('hook stop --host cursor --project "$d"\''));
  assert.ok(!Object.keys(out('.github/hooks/go-getter.json').hooks).some((e) => /stop/i.test(e)), 'Copilot cannot block a stop: advisory');
  assert.equal(plan.outputs['.opencode/plugins/go-getter.js'], undefined, 'no path guardrail, no pre-tool plugin');
  assert.equal(out('.claude/settings.json').hooks.PreToolUse, undefined, 'the gate alone installs no pre-tool hook');
  writeApply(dir, plan);
  assert.deepEqual(diffApply(dir, planApply(dir, { hosts })), []);
  done(dir);
  const report = project();
  adopt(report, answersFor({ gate: 'report' }));
  const reportPlan = planApply(report, { hosts });
  assert.equal(reportPlan.outputs['.claude/settings.json'].content.includes('hook stop'), false);
  done(report);
});

test('coverage shows the verification gate per host', () => {
  const dir = project();
  adopt(dir);
  const caps = loadCapabilities(root);
  const row = coverage(dir, { 'verification-gate': pack }, caps).find((r) => r.component === 6);
  assert.deepEqual(row.packs, [`verification-gate@${pack.version}`]);
  assert.equal(row.tiers['claude-code'], 2);
  assert.equal(row.tiers.cursor, 2);
  done(dir);
});
