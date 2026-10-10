import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadPack, loadPackSchema, validatePack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { runTier3, collectEnforcement } from '../src/enforce.mjs';
import { planApply, writeApply, diffApply } from '../src/apply.mjs';
import { evaluatePreTool, restrictedModes } from '../src/hook.mjs';
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
  'restricted-modes': [],
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
  assert.ok(!restrictedDataHosts(dir, caps).includes('kilo') && !restrictedDataHosts(dir, caps).includes('opencode'), 'no OS sandbox lever there');
  assert.deepEqual(promptLoggingTargets(dir, caps, ['gemini-cli', 'kilo', 'opencode']), ['gemini-cli']);
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
  assert.deepEqual(dlp.packs, [`governance@${pack.version}`]);
  assert.ok(Object.values(dlp.tiers).every((t) => t === 3));
  assert.ok(Object.values(dlp.inHost).every((t) => t === 2));
  assert.match(formatCoverage(rows), new RegExp(`^7 Guardrails & DLP\\s+governance@${pack.version.replace(/\./g, '\\.')}\\s+hook\\+ci\\s+hook\\+ci`, 'm'));
  rmSync(dir, { recursive: true, force: true });
});

// Access modes (decision 0072). Test paths avoid this repo's own restricted patterns.
const modeProject = (modes) => {
  const dir = project();
  adopt(dir, answersFor({ 'restricted-paths': ['vault/', 'inbox/', 'keys/'], 'restricted-modes': modes }));
  return dir;
};
const call = (dir, tool_name, tool_input) => evaluatePreTool(dir, { tool_name, tool_input }).deny;
const FILES = { use: 'vault/db.txt', sink: 'inbox/token.txt', deny: 'keys/id.txt' };

test('the restricted-modes answer is recorded as decision data; a pattern under both modes is deny', () => {
  const dir = modeProject(['use:vault/', 'sink:inbox/', 'use:keys/', 'sink:keys/']);
  assert.deepEqual(Object.fromEntries(restrictedModes(dir)), { 'vault/': 'use', 'inbox/': 'sink', 'keys/': 'deny' });
  rmSync(dir, { recursive: true, force: true });
});

test('every mode is denied to reads, writes and go-getter commands other than secret run and put', () => {
  const dir = modeProject(['use:vault/', 'sink:inbox/']);
  for (const [mode, file] of Object.entries(FILES)) {
    assert.equal(call(dir, 'Read', { file_path: path.join(dir, file) }), true, `${mode}: read`);
    assert.equal(call(dir, 'Write', { file_path: path.join(dir, file), content: 'x' }), true, `${mode}: write`);
    assert.equal(call(dir, 'Bash', { command: `go-getter watch -- cat ${file}` }), true, `${mode}: watch`);
    assert.equal(call(dir, 'Bash', { command: `go-getter --version; cat ${file}` }), true, `${mode}: chained`);
    assert.equal(call(dir, 'Bash', { command: `go-getter verify -- cat ${file}` }), true, `${mode}: verify`);
  }
  rmSync(dir, { recursive: true, force: true });
});

test('only a call that is exactly go-getter secret run (use) or put (sink) is exempt', () => {
  const dir = modeProject(['use:vault/', 'sink:inbox/']);
  const shell = (command) => call(dir, 'Bash', { command });
  assert.equal(shell(`go-getter secret run ${FILES.use}`), false);
  assert.equal(shell(`go-getter secret run --file ${path.join(dir, FILES.use)} -- node app.js`), false);
  assert.equal(shell(`go-getter secret put ${FILES.sink}`), false);
  // the wrong mode, a deny path, or a deny path beside an exempt one
  assert.equal(shell(`go-getter secret put ${FILES.use}`), true);
  assert.equal(shell(`go-getter secret run ${FILES.sink}`), true);
  assert.equal(shell(`go-getter secret run ${FILES.deny}`), true);
  assert.equal(shell(`go-getter secret run ${FILES.use} ${FILES.deny}`), true);
  // anything but one plain go-getter secret run|put command
  const f = FILES.use;
  for (const command of [
    `go-getter secret run ${f}; cat ${f}`, `go-getter secret run ${f} && cat ${f}`, `go-getter secret run ${f} | tee out`,
    `go-getter secret run ${f} > out`, `go-getter secret run ${f}\ncat ${f}`, `go-getter secret run "${f}"`,
    `go-getter secret run $(cat ${f})`, `go-getter secret run \`cat ${f}\``, ` go-getter secret run ${f}`,
    `npx go-getter secret run ${f}`, `echo go-getter secret run ${f}`, `go-getter secret runner ${f}`,
    `go-getter watch -- go-getter secret run ${f}`, `X=1 go-getter secret run ${f}`, `go-getter  secret run ${f}`,
  ]) assert.equal(shell(command), true, command);
  // only a shell tool, and only paths in its command
  assert.equal(call(dir, 'Read', { file_path: f, command: `go-getter secret run ${f}` }), true);
  assert.equal(call(dir, 'Bash', { command: `go-getter secret run ${f}`, cwd: FILES.deny }), true);
  rmSync(dir, { recursive: true, force: true });
});

test('without modes, secret run and put are denied too; the tier-3 check rejects every mode', async () => {
  let dir = modeProject([]);
  assert.equal(call(dir, 'Bash', { command: `go-getter secret run ${FILES.use}` }), true);
  rmSync(dir, { recursive: true, force: true });
  dir = modeProject(['use:vault/', 'sink:inbox/']);
  for (const file of Object.values(FILES)) {
    mkdirSync(path.join(dir, path.dirname(file)), { recursive: true });
    writeFileSync(path.join(dir, file), 'x\n');
  }
  execFileSync('git', ['add', '-f', ...Object.values(FILES)], { cwd: dir });
  const result = (await runTier3(dir, { onlyGuardrail: 'restricted-paths-denied' }))[0];
  assert.equal(result.ok, false);
  for (const file of Object.values(FILES)) assert.match(result.message, new RegExp(file.replace(/\./g, '\\.')));
  rmSync(dir, { recursive: true, force: true });
});

test('secret scanning is on by default and renders a tier-3 check at the commit and push stages', () => {
  const dir = project();
  try {
    adopt(dir, answersFor({ 'scan-allow-paths': ['tests/fixtures/**', 'docs/**'] }));
    const entries = collectEnforcement(dir).filter((e) => e.guardrail === 'no-secrets-in-added-lines');
    assert.deepEqual(entries.map((e) => e.tier), [3, 1]);
    assert.equal(entries[0].parsed.id, 'secret-scan');
    assert.equal(entries[0].parsed.args.allow, 'tests/fixtures/**, docs/**');
    assert.deepEqual(entries[0].stages, ['pre-commit', 'pre-push']);
    const plan = planApply(dir, { hosts: ['claude-code'] });
    assert.ok(plan.outputs['.githooks/pre-commit'], 'a pre-commit hook is planned');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an empty allow list skips nothing, and turning the scan off renders a decision and no guardrail', () => {
  const on = project();
  const off = project();
  try {
    adopt(on, answersFor({ 'scan-allow-paths': [] }));
    assert.equal(collectEnforcement(on).find((e) => e.guardrail === 'no-secrets-in-added-lines' && e.tier === 3).parsed.args.allow, '');
    adopt(off, answersFor({ 'secret-scan': 'off' }));
    assert.equal(collectEnforcement(off).some((e) => e.guardrail === 'no-secrets-in-added-lines'), false);
    assert.match(readFileSync(path.join(off, 'docs/decisions', readdirSync(path.join(off, 'docs/decisions')).find((f) => f.endsWith('-secret-scan.md'))), 'utf8'), /not scanned/);
  } finally {
    rmSync(on, { recursive: true, force: true });
    rmSync(off, { recursive: true, force: true });
  }
});

test('an answer file from before 0.3.0 renders with scanning on and no skipped paths', () => {
  const dir = project();
  try {
    const old = answersFor();
    delete old['secret-scan'];
    delete old['scan-allow-paths'];
    adopt(dir, old);
    const scan = collectEnforcement(dir).find((e) => e.guardrail === 'no-secrets-in-added-lines' && e.tier === 3);
    assert.equal(scan.parsed.args.allow, '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PII masking is on by default and renders a tier-2 redact-pii entry the hook reads', async () => {
  const { piiConfig } = await import('../src/secrets/mask.mjs');
  const dir = project();
  const extra = project();
  try {
    adopt(dir);
    const entries = collectEnforcement(dir).filter((e) => e.guardrail === 'pii-masked-in-tool-output');
    assert.deepEqual(entries.map((e) => e.tier), [2, 1]);
    assert.equal(entries[0].parsed.id, 'redact-pii');
    assert.deepEqual(piiConfig(dir), { classes: ['email', 'card', 'iban'] });
    adopt(extra, answersFor({ 'pii-extra': ['phone', 'national-id'] }));
    assert.deepEqual(piiConfig(extra).classes, ['email', 'card', 'iban', 'phone', 'national-id']);
    const plan = planApply(dir, { hosts: ['claude-code'] });
    assert.ok(JSON.parse(plan.outputs['.claude/settings.json'].content).hooks.PostToolUse, 'the post-tool hook is installed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(extra, { recursive: true, force: true });
  }
});

test('turning PII masking off renders a decision and no guardrail; an old answer file renders with it on', async () => {
  const { piiConfig } = await import('../src/secrets/mask.mjs');
  const off = project();
  const old = project();
  try {
    adopt(off, answersFor({ 'pii-masking': 'off' }));
    assert.equal(collectEnforcement(off).some((e) => e.guardrail === 'pii-masked-in-tool-output'), false);
    assert.equal(piiConfig(off), null);
    const answers = answersFor();
    delete answers['pii-masking'];
    delete answers['pii-extra'];
    adopt(old, answers);
    assert.deepEqual(piiConfig(old), { classes: ['email', 'card', 'iban'] });
  } finally {
    rmSync(off, { recursive: true, force: true });
    rmSync(old, { recursive: true, force: true });
  }
});

test('the extra types accept only phone and national-id', () => {
  const q = pack.questions.find((x) => x.id === 'pii-extra');
  const re = new RegExp(q.pattern);
  assert.ok(re.test('phone') && re.test('national-id'));
  assert.ok(!re.test('email') && !re.test('ssn'));
});
