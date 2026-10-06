import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, utimesSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadPack, loadPackSchema, validatePack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { planApply, writeApply, diffApply } from '../src/apply.mjs';
import { loadPolicy, compiledDefault } from '../src/routing/policy.mjs';
import { routeDelegation, routeRecord } from '../src/routing/delegate.mjs';
import { readLog } from '../src/telemetry/record.mjs';
import { validateRecord } from '../src/telemetry/schema.mjs';
import { coverage } from '../src/coverage.mjs';
import { loadCapabilities } from '../src/capabilities.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = path.join(root, 'compiler/bin/go-getter.mjs');
const load = (id) => loadPack(path.join(root, `src/packs/${id}/pack.json`));
const packs = Object.fromEntries(['cost-routing', 'governance', 'orchestration', 'telemetry'].map((id) => [id, load(id)]));
const pack = packs['cost-routing'];
// Answers for questions behind a `when` are harmless: the renderer ignores them while they are inactive.
const recommended = (p) => Object.fromEntries(p.questions.map((q) => [q.id, q.options ? q.options.find((o) => o.recommended).id : q.default]).filter(([, v]) => v !== undefined));
const answersFor = (overrides = {}) => ({ ...recommended(pack), ...overrides });
const FACTS = ['0011-model-pricing-anthropic', '0012-model-pricing-openai', '0013-model-pricing-google', '0024-model-tiers-and-host-providers'];
const ALL_HOSTS = ['claude-code', 'codex', 'kilo', 'opencode', 'cursor', 'gemini-cli', 'copilot'];

function project({ governance = {}, adoptGovernance = true, routing = answersFor(), withRouting = true } = {}) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-routing-')));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/facts'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nmodel-routing — x\ncost — x\nguardrail — x\ngovernance — x\nsecurity — x\nenforcement — x\nobservability — x\nagent-roles — x\nharness — x\n');
  for (const f of FACTS) copyFileSync(path.join(root, 'docs/facts', `${f}.md`), path.join(dir, 'docs/facts', `${f}.md`));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  const adopt = (p, answers) => applyRender({ root: dir, plan: planRender({ root: dir, pack: p, answers, acceptedBy: 't', date: '2026-10-05' }) });
  adopt(packs.orchestration, recommended(packs.orchestration));
  adopt(packs.telemetry, { recording: 'metadata-log', retention: '30', export: 'none' });
  if (adoptGovernance) adopt(packs.governance, { ...recommended(packs.governance), 'restricted-paths': ['secrets/'], ...governance });
  if (withRouting) adopt(pack, routing);
  return dir;
}
const done = (dir) => rmSync(dir, { recursive: true, force: true });
const delegate = (host, input, extra = {}) => ({ tool_name: { 'claude-code': 'Agent', codex: 'spawn_agent', cursor: 'Task' }[host] ?? 'Agent', tool_input: input, ...extra });
const hook = (dir, host, payload) => spawnSync('node', [bin, 'hook', 'pre-tool', '--host', host, '--project', dir], { input: JSON.stringify(payload), encoding: 'utf8' });

test('the cost-routing pack is valid and covers component 11', () => {
  assert.deepEqual(validatePack(loadPackSchema(root), pack, { dirName: 'cost-routing' }), []);
  assert.deepEqual(pack.components, [11]);
});

test('the recommended answers match decision 0032', () => {
  assert.deepEqual(recommended(pack), { classes: 'five-classes', tiers: 'balanced', 'max-escalations': '2', 'spend-cap': '5', 'cache-ttl': 'main-1h-sub-5m' });
});

test('every choice answer renders and the text answers are checked against their patterns', () => {
  const dir = project({ withRouting: false });
  for (const q of pack.questions.filter((x) => x.options)) {
    for (const o of q.options) {
      const plan = planRender({ root: dir, pack, answers: answersFor({ [q.id]: o.id }), acceptedBy: 't', date: '2026-10-05' });
      assert.ok(plan.artifacts.length >= 5, `${q.id}=${o.id}`);
    }
  }
  assert.throws(() => planRender({ root: dir, pack, answers: answersFor({ 'max-escalations': 'two' }), acceptedBy: 't' }), /does not match the pattern/);
  assert.throws(() => planRender({ root: dir, pack, answers: answersFor({ 'spend-cap': '0' }), acceptedBy: 't' }), /does not match the pattern/);
  done(dir);
});

test('the adopted answers read back as the routing policy', () => {
  const none = project({ withRouting: false });
  assert.equal(loadPolicy(none), null);
  done(none);
  const dir = project();
  assert.deepEqual(loadPolicy(dir), {
    classes: { explore: 'explore', plan: 'plan', implement: 'implement', review: 'review', debug: 'debug' },
    startTiers: { explore: 'small', plan: 'large', implement: 'medium', review: 'large', debug: 'large' },
    efforts: { explore: 'low', plan: 'medium', implement: 'medium', review: 'medium', debug: 'medium' },
    maxEscalations: 2,
    spendCapUsd: 5,
    cacheTtl: { main: '1h', subagent: '5m' },
  });
  done(dir);
});

test('the other answers change the policy', () => {
  const dir = project({ routing: answersFor({ classes: 'fast-strong', tiers: 'cost-first', 'max-escalations': '0', 'spend-cap': '12.5', 'cache-ttl': 'host-defaults' }) });
  const policy = loadPolicy(dir);
  assert.equal(policy.classes.explore, 'fast');
  assert.equal(policy.startTiers.implement, 'small');
  assert.equal(policy.maxEscalations, 0);
  assert.equal(policy.spendCapUsd, 12.5);
  assert.deepEqual(policy.cacheTtl, { main: null, subagent: null });
  done(dir);
});

test("compiled defaults pick the cheapest eligible model of each role's tier, per host", () => {
  const dir = project();
  const role = (taskClass) => ({ 'task-class': taskClass });
  assert.deepEqual(compiledDefault(dir, 'claude-code', role('explore')), { model: 'claude-haiku-4-5', provider: 'anthropic', effort: 'low' });
  assert.deepEqual(compiledDefault(dir, 'claude-code', role('implement')), { model: 'claude-sonnet-5-5', provider: 'anthropic', effort: 'medium' });
  assert.equal(compiledDefault(dir, 'claude-code', role('plan')).model, 'claude-opus-5-5');
  assert.equal(compiledDefault(dir, 'codex', role('explore')).model, 'gpt-6-luna');
  assert.equal(compiledDefault(dir, 'gemini-cli', role('implement')).model, 'gemini-3.8-flash');
  assert.equal(compiledDefault(dir, 'gemini-cli', role('implement'), { effortControl: false }).effort, null);
  // Cursor runs several providers, so the cheapest model of the tier wins whichever provider it comes from.
  assert.equal(compiledDefault(dir, 'cursor', role('explore')).model, 'gpt-6-luna');
  assert.equal(compiledDefault(dir, 'copilot', role('explore')), null, 'no model ids are known for Copilot');
  done(dir);
});

test('governance comes first: with local-only internal data no cloud model is compiled in', () => {
  const dir = project({ governance: { 'internal-data': 'local-only' } });
  assert.equal(compiledDefault(dir, 'claude-code', { 'task-class': 'implement' }), null);
  done(dir);
  const single = project({ governance: { 'internal-data': 'single-provider', provider: 'openai' } });
  assert.equal(compiledDefault(single, 'claude-code', { 'task-class': 'implement' }), null, 'Claude Code runs anthropic models only');
  assert.equal(compiledDefault(single, 'cursor', { 'task-class': 'plan' }).provider, 'openai');
  done(single);
});

test('without governance every model is eligible', () => {
  const dir = project({ adoptGovernance: false });
  assert.equal(compiledDefault(dir, 'claude-code', { 'task-class': 'implement' }).model, 'claude-sonnet-5-5');
  done(dir);
});

test('apply compiles the default model and effort into every role file that can carry them', () => {
  const dir = project();
  const plan = planApply(dir, { hosts: ALL_HOSTS });
  const file = (rel) => plan.outputs[rel].content;
  assert.match(file('.claude/agents/implementer.md'), /^model: claude-sonnet-5-5$/m);
  assert.match(file('.claude/agents/implementer.md'), /^effort: medium$/m);
  assert.match(file('.claude/agents/explorer.md'), /^model: claude-haiku-4-5$/m);
  assert.match(file('.claude/agents/planner.md'), /^model: claude-opus-5-5$/m);
  assert.match(file('.codex/agents/implementer.toml'), /^model = "gpt-6\.1-sol"$/m);
  assert.match(file('.codex/agents/implementer.toml'), /^model_reasoning_effort = "medium"$/m);
  assert.match(file('.opencode/agents/explorer.md'), /^model: "?openai\/gpt-6-luna"?$/m);
  assert.match(file('.kilo/agents/explorer.md'), /^model: "?openai\/gpt-6-luna"?$/m);
  assert.match(file('.cursor/agents/explorer.md'), /^model: "gpt-6-luna\[effort=low\]"$/m);
  assert.match(file('.gemini/agents/implementer.md'), /^model: "?gemini-3\.8-flash"?$/m);
  assert.doesNotMatch(file('.gemini/agents/implementer.md'), /effort/);
  assert.doesNotMatch(file('.github/agents/implementer.agent.md'), /^model/m);
  writeApply(dir, plan);
  assert.deepEqual(diffApply(dir, planApply(dir, { hosts: ALL_HOSTS })), []);
  done(dir);
});

test('apply writes the cache lifetimes where the host has settings, and nothing for host defaults', () => {
  const settings = (d) => JSON.parse(planApply(d, { hosts: ['claude-code'] }).outputs['.claude/settings.json'].content);
  const dir = project();
  assert.equal(settings(dir).promptCacheTtl, '1h');
  assert.equal(settings(dir).subagentPromptCacheTtl, '5m');
  assert.ok(settings(dir).hooks, 'the hook config survives next to the cache settings');
  done(dir);
  const five = project({ routing: answersFor({ 'cache-ttl': 'five-minutes' }) });
  assert.equal(settings(five).promptCacheTtl, '5m');
  assert.equal(settings(five).subagentPromptCacheTtl, '5m');
  done(five);
  const defaults = project({ routing: answersFor({ 'cache-ttl': 'host-defaults' }) });
  assert.equal(settings(defaults).promptCacheTtl, undefined);
  done(defaults);
  const other = project();
  const codex = planApply(other, { hosts: ['codex'] }).outputs;
  assert.ok(!JSON.stringify(codex['.codex/hooks.json'] ?? {}).includes('CacheTtl'), 'Codex has no documented cache lifetime setting');
  done(other);
});

test('the guardrail declares tier 1 and a tier-2 routing entry, and coverage reads it per host', () => {
  const dir = project();
  const guardrail = readFileSync(path.join(dir, 'docs/guardrails/delegations-are-routed.md'), 'utf8');
  assert.match(guardrail, /run: builtin:route-delegation/);
  const row = coverage(dir, { 'cost-routing': pack }, loadCapabilities(root)).find((r) => r.component === 11);
  assert.deepEqual(row.packs, [`cost-routing@${pack.version}`]);
  assert.equal(row.tiers['claude-code'], 2);
  done(dir);
});

test('the pre-tool hook sets the delegated model on Claude Code (as its alias), Codex and Cursor', () => {
  const dir = project();
  const claude = hook(dir, 'claude-code', delegate('claude-code', { subagent_type: 'implementer', prompt: 'make the change' }));
  assert.equal(claude.status, 0);
  assert.deepEqual(JSON.parse(claude.stdout).hookSpecificOutput, {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    updatedInput: { subagent_type: 'implementer', prompt: 'make the change', model: 'sonnet' }, // the Agent tool takes family aliases only
  });
  const codex = JSON.parse(hook(dir, 'codex', delegate('codex', { agent: 'explorer', prompt: 'find it' })).stdout);
  assert.equal(codex.hookSpecificOutput.updatedInput.model, 'gpt-6-luna');
  const cursor = JSON.parse(hook(dir, 'cursor', delegate('cursor', { subagent_type: 'planner', prompt: 'plan it' })).stdout);
  assert.equal(cursor.permission, 'allow');
  assert.equal(cursor.updated_input.model, 'gemini-3.1-pro-preview', 'the cheapest large model across the providers Cursor runs');
  done(dir);
});

test('a routed model the host has no value for leaves the delegation unchanged (advisory)', () => {
  const dir = project();
  const caps = loadCapabilities(root);
  const capabilities = { ...caps, 'claude-code': { ...caps['claude-code'], routing: { ...caps['claude-code'].routing, delegation: { ...caps['claude-code'].routing.delegation, models: [{ prefix: 'none-', alias: 'none' }] } } } };
  const routed = routeDelegation(dir, 'claude-code', delegate('claude-code', { subagent_type: 'implementer', prompt: 'x' }), { capabilities });
  assert.equal(routed.rewrite, undefined, 'the agent file\'s compiled default applies');
  assert.equal(routed.route.action, 'delegate');
  assert.match(routed.advisory, /advisory/);
  done(dir);
});

test('the hook leaves alone what it should not route', () => {
  const dir = project();
  const quiet = (host, payload) => {
    const run = hook(dir, host, payload);
    assert.equal(run.status, 0);
    assert.equal(run.stdout, '');
  };
  quiet('claude-code', { tool_name: 'Bash', tool_input: { command: 'ls' } });
  quiet('claude-code', delegate('claude-code', { subagent_type: 'implementer', prompt: 'x', model: 'claude-opus-5-5' })); // the delegator chose
  quiet('claude-code', delegate('claude-code', { subagent_type: 'not-a-role', prompt: 'x' }));
  quiet('gemini-cli', { tool_name: 'Agent', tool_input: { subagent_type: 'implementer' } }); // no rewrite lever
  quiet('copilot', { tool_name: 'Agent', tool_input: { subagent_type: 'implementer' } });
  done(dir);
  const bare = project({ withRouting: false });
  assert.equal(routeDelegation(bare, 'claude-code', delegate('claude-code', { subagent_type: 'implementer' })), null, 'not adopted: no routing');
  done(bare);
});

test('with no eligible model the delegation is denied and a human decides', () => {
  const dir = project({ governance: { 'internal-data': 'local-only' } });
  const run = hook(dir, 'claude-code', delegate('claude-code', { subagent_type: 'implementer', prompt: 'x' }));
  assert.equal(run.status, 2);
  assert.match(run.stderr, /no eligible model/);
  assert.match(run.stderr, /a human decides/);
  done(dir);
});

test('a small warm session on a strong-enough model stays; the same session gone cold delegates', () => {
  const dir = project();
  const transcript = path.join(dir, 'transcript.jsonl');
  writeFileSync(transcript, 'x'.repeat(40_000)); // about ten thousand tokens of prefix
  const payload = delegate('claude-code', { subagent_type: 'implementer', prompt: 'x' }, { model: 'claude-sonnet-5-5', transcript_path: transcript });
  const warm = routeDelegation(dir, 'claude-code', payload);
  assert.equal(warm.route.action, 'stay', 'a fresh agent would start a cold cache for no saving');
  assert.equal(warm.rewrite, undefined);
  // Idle for longer than the one-hour main-session cache, the prefix would have to be rewritten: a fresh delegate is cheaper.
  const old = new Date(Date.now() - 3 * 3600 * 1000);
  utimesSync(transcript, old, old);
  const cold = routeDelegation(dir, 'claude-code', payload);
  assert.equal(cold.route.action, 'delegate');
  assert.equal(cold.rewrite.input.model, 'sonnet');
  // A session on a model below the class's tier cannot take the work, however warm it is.
  utimesSync(transcript, new Date(), new Date());
  const weak = routeDelegation(dir, 'claude-code', { ...payload, tool_input: { subagent_type: 'planner', prompt: 'x' }, model: 'claude-haiku-4-5' });
  assert.equal(weak.route.action, 'delegate');
  assert.equal(weak.rewrite.input.model, 'opus');
  done(dir);
});

test('routed delegations are recorded as metadata only', () => {
  const dir = project();
  hook(dir, 'claude-code', delegate('claude-code', { subagent_type: 'planner', prompt: 'a confidential brief that must not be recorded' }));
  const records = readLog(dir).filter((r) => r.event === 'route');
  assert.equal(records.length, 1);
  assert.deepEqual([records[0].host, records[0].taskClass, records[0].model, records[0].effort], ['claude-code', 'plan', 'claude-opus-5-5', 'medium']);
  assert.ok(records[0].cost > 0);
  assert.ok(records[0].tokens.input >= 4000);
  assert.deepEqual(validateRecord(records[0]), []);
  assert.ok(!JSON.stringify(readLog(dir)).includes('confidential brief'));
  assert.deepEqual(routeRecord('claude-code', { action: 'human', taskClass: 'plan' }), { event: 'route', host: 'claude-code', taskClass: 'plan', outcome: 'escalated' });
  done(dir);
});

test('go-getter route answers from the adopted policy, escalates and stops at the bound', () => {
  const dir = project();
  const route = (...args) => {
    const run = spawnSync('node', [bin, 'route', '--project', dir, '--host', 'claude-code', ...args], { encoding: 'utf8' });
    return { code: run.status, out: run.stdout.trim().startsWith('{') ? JSON.parse(run.stdout) : run.stdout.trim(), err: run.stderr };
  };
  const first = route('--class', 'explore', '--context-tokens', '5000', '--cache', 'cold');
  assert.deepEqual([first.code, first.out.action, first.out.model, first.out.effort], [0, 'delegate', 'claude-haiku-4-5', 'low']);
  assert.equal(first.out.delegateModel, 'haiku', "the host's Agent tool takes only the family alias");
  const noHost = JSON.parse(spawnSync('node', [bin, 'route', '--project', dir, '--class', 'explore'], { encoding: 'utf8' }).stdout);
  assert.equal(noHost.delegateModel, noHost.model, 'without a host the full id is the value');
  const up1 = route('--escalate', '--class', 'explore', '--from', 'small', '--attempts', '0');
  assert.deepEqual([up1.out.action, up1.out.tier, up1.out.attempts, up1.out.delegateModel], ['delegate', 'medium', 1, 'sonnet']);
  const up2 = route('--escalate', '--class', 'explore', '--from', 'medium', '--attempts', '1');
  assert.deepEqual([up2.out.tier, up2.out.attempts], ['large', 2]);
  const bound = route('--escalate', '--class', 'explore', '--from', 'large', '--attempts', '2');
  assert.equal(bound.out.action, 'human');
  assert.equal(route('--class', 'explore', '--data-class', 'restricted').out.action, 'human');
  assert.equal(route().code, 2);
  assert.deepEqual(route('--headless-flags').out, { host: 'claude-code', spendCapUsd: 5, flags: '--max-budget-usd 5' });
  const flags = (host) => JSON.parse(spawnSync('node', [bin, 'route', '--project', dir, '--host', host, '--headless-flags'], { encoding: 'utf8' }).stdout);
  assert.equal(flags('copilot').flags, '--max-ai-credits 5');
  assert.equal(flags('cursor').flags, null);
  const bare = project({ withRouting: false });
  assert.equal(spawnSync('node', [bin, 'route', '--project', bare, '--class', 'explore'], { encoding: 'utf8' }).status, 2);
  done(bare);
  done(dir);
});
