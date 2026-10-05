import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadPack, loadPackSchema, validatePack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { runTier3, collectEnforcement } from '../src/enforce.mjs';
import { planApply, writeApply, diffApply } from '../src/apply.mjs';
import { evaluatePreTool } from '../src/hook.mjs';
import { loadCapabilities } from '../src/capabilities.mjs';
import { coverage, formatCoverage } from '../src/coverage.mjs';
import { loadRegistry } from '../src/routing/registry.mjs';
import { eligibleModels } from '../src/routing/eligibility.mjs';
import { restrictedDataHosts, promptLoggingTargets } from '../src/governance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pack = loadPack(path.join(root, 'src/packs/governance/pack.json'));
const answersFor = (overrides = {}) => ({
  ...Object.fromEntries(pack.questions.filter((q) => q.options).map((q) => [q.id, q.options.find((o) => o.recommended).id])),
  'restricted-paths': ['.env', '.env.*', '*.pem', 'secrets/'],
  ...overrides,
});

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-governance-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/facts'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\ngovernance — x\nsecurity — x\nmodel-routing — x\nenforcement — x\nobservability — x\nguardrail — x\n');
  writeFileSync(path.join(dir, 'docs/facts/0001-prices.md'), '---\nid: 0001-prices\ntitle: Prices\nstatus: active\ndate: 2026-10-05\ntags: [model-routing]\nkind: environmental\ngo-getter:\n  models:\n    - {id: cheap-model, provider: other, input: 0.1, output: 0.5}\n    - {id: model-a, provider: anthropic, input: 2, output: 10}\n    - {id: model-b, provider: openai, input: 2, output: 10}\n    - {id: local-1, provider: ollama, local: true}\n---\n\nPrices.\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

const adopt = (dir, answers = answersFor()) => applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-10-05' }) });

test('the governance pack is valid and covers component 7', () => {
  assert.deepEqual(validatePack(loadPackSchema(root), pack, { dirName: 'governance' }), []);
  assert.deepEqual(pack.components, [7]);
});

test('every answer of every choice question renders', () => {
  for (const q of pack.questions.filter((x) => x.options)) {
    for (const o of q.options) {
      const dir = project();
      const plan = planRender({ root: dir, pack, answers: answersFor({ [q.id]: o.id, ...(o.id === 'single-provider' ? { provider: 'openai' } : {}) }), acceptedBy: 't', date: '2026-10-05' });
      assert.ok(plan.artifacts.some((a) => a.kind === 'decisions'), `${q.id}=${o.id} records a decision`);
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('the provider question is asked only for the single-provider answer', () => {
  const dir = project();
  assert.throws(() => planRender({ root: dir, pack, answers: answersFor({ 'internal-data': 'single-provider' }), acceptedBy: 't' }), /no answer for question "provider"/);
  assert.throws(() => planRender({ root: dir, pack, answers: answersFor({ 'internal-data': 'single-provider', provider: 'acme' }), acceptedBy: 't' }), /does not match the pattern/);
  rmSync(dir, { recursive: true, force: true });
});

test('the hook blocks reads of restricted paths and the tier-3 check flags a tracked one', async () => {
  const dir = project();
  adopt(dir);
  const read = (file) => ({ tool_name: 'Read', tool_input: { file_path: path.join(dir, file) } });
  assert.equal(evaluatePreTool(dir, read('.env')).deny, true);
  assert.equal(evaluatePreTool(dir, read('deploy/.env.production')).deny, true);
  assert.equal(evaluatePreTool(dir, { tool_name: 'Bash', tool_input: { command: 'cat server.pem | head' } }).deny, true);
  assert.equal(evaluatePreTool(dir, read('secrets/prod.json')).deny, true);
  assert.equal(evaluatePreTool(dir, read('src/index.js')).deny, false);
  const check = async () => (await runTier3(dir, { onlyGuardrail: 'restricted-paths-denied' }))[0];
  assert.equal((await check()).ok, true);
  writeFileSync(path.join(dir, '.env'), 'X=1\n');
  execFileSync('git', ['add', '-f', '.env'], { cwd: dir });
  const result = await check();
  assert.equal(result.ok, false);
  assert.match(result.message, /\.env/);
  rmSync(dir, { recursive: true, force: true });
});

test('weaker enforcement answers drop the tiers they cannot back', () => {
  const tiersOf = (answer) => {
    const dir = project();
    adopt(dir, answersFor({ enforcement: answer }));
    const tiers = collectEnforcement(dir).filter((e) => e.guardrail === 'restricted-paths-denied').map((e) => e.tier);
    rmSync(dir, { recursive: true, force: true });
    return tiers;
  };
  assert.deepEqual(tiersOf('hook-and-never-committed'), [2, 3]);
  assert.deepEqual(tiersOf('never-committed'), [3]);
  assert.deepEqual(tiersOf('advisory'), [1]);
});

test('apply switches off prompt logging where the decision requires it and the check catches a regression', async () => {
  const dir = project();
  adopt(dir);
  writeApply(dir, planApply(dir, { hosts: ['gemini-cli', 'claude-code'] }));
  const settings = () => JSON.parse(readFileSync(path.join(dir, '.gemini/settings.json'), 'utf8'));
  assert.equal(settings().telemetry.logPrompts, false);
  assert.ok(settings().hooks.BeforeTool, 'the hook config survives next to the telemetry setting');
  assert.deepEqual(diffApply(dir, planApply(dir, { hosts: ['gemini-cli', 'claude-code'] })), []);
  const check = async () => (await runTier3(dir, { onlyGuardrail: 'prompt-logging-disabled' }))[0];
  assert.equal((await check()).ok, true);
  writeFileSync(path.join(dir, '.gemini/settings.json'), JSON.stringify({ ...settings(), telemetry: { logPrompts: true } }));
  assert.match((await check()).message, /telemetry\.logPrompts/);
  rmSync(dir, { recursive: true, force: true });
});

test('host defaults leave prompt logging alone', () => {
  const dir = project();
  adopt(dir, answersFor({ 'prompt-logging': 'host-defaults' }));
  const plan = planApply(dir, { hosts: ['gemini-cli'] });
  assert.equal(JSON.parse(plan.outputs['.gemini/settings.json'].content).telemetry, undefined);
  rmSync(dir, { recursive: true, force: true });
});

test('restricted-hosts scope follows the hosts rule', () => {
  const caps = loadCapabilities(root);
  const dir = project();
  adopt(dir, answersFor({ 'prompt-logging': 'disable-restricted-hosts', 'restricted-hosts': 'sandbox-hosts' }));
  assert.ok(!restrictedDataHosts(dir, caps).includes('kilo-opencode'), 'no OS sandbox lever there');
  assert.deepEqual(promptLoggingTargets(dir, caps, ['gemini-cli', 'kilo-opencode']), ['gemini-cli']);
  rmSync(dir, { recursive: true, force: true });
  const other = project();
  adopt(other, answersFor({ 'prompt-logging': 'disable-restricted-hosts' }));
  assert.deepEqual(promptLoggingTargets(other, caps, ['gemini-cli']), ['gemini-cli']);
  rmSync(other, { recursive: true, force: true });
});

test('the registry built from the adopted decisions keeps ineligible models out', () => {
  const dir = project();
  adopt(dir, answersFor({ 'internal-data': 'single-provider', provider: 'anthropic', 'confidential-zdr': 'zdr-required' }));
  const { models, registry } = loadRegistry(dir);
  assert.deepEqual(registry.providers, [{ id: 'anthropic', zdr: false }]);
  assert.deepEqual(registry.confidential, { enabled: true, requiresZdr: true });
  const ids = (dataClass) => eligibleModels({ dataClass, models, registry }).map((m) => m.id);
  assert.deepEqual(ids('public'), ['cheap-model', 'model-a', 'model-b', 'local-1']);
  assert.deepEqual(ids('internal'), ['model-a', 'local-1']);
  assert.deepEqual(ids('confidential'), ['local-1'], 'no provider is recorded with zero data retention');
  assert.deepEqual(ids('restricted'), ['local-1']);
  rmSync(dir, { recursive: true, force: true });
});

test('coverage shows the DLP tier per host', () => {
  const dir = project();
  adopt(dir);
  const rows = coverage(dir, { governance: pack }, loadCapabilities(root));
  const dlp = rows.find((r) => r.component === 7);
  assert.deepEqual(dlp.packs, ['governance@0.1.0']);
  assert.ok(Object.values(dlp.tiers).every((t) => t === 3));
  assert.ok(Object.values(dlp.inHost).every((t) => t === 2));
  assert.match(formatCoverage(rows), /^7 Guardrails & DLP\s+governance@0\.1\.0\s+hook\+ci\s+hook\+ci/m);
  rmSync(dir, { recursive: true, force: true });
});
