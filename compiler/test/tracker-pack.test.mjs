import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, loadPackSchema, validatePack } from '../src/packs.mjs';
import { planRender, applyRender, activeQuestions, withFallbacks } from '../src/render.mjs';
import { collectEnforcement } from '../src/enforce.mjs';
import { gateEntries, nativeRules, matchGated } from '../src/gate.mjs';
import { loadCapabilities } from '../src/capabilities.mjs';
import { writeMode } from '../src/trackers/write.mjs';
import { adoptedData } from '../src/governance.mjs';
import { jiraConfig, checkConfig } from '../src/trackers/jira.mjs';
import { adoptedArtifacts, currentAnswers } from '../src/reconfigure.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const goldenFile = path.join(here, 'golden/tracker-pack.json');
const pack = loadPack(path.join(root, 'src/packs/tracker/pack.json'));
const github = { tracker: 'github', writes: 'ask' };

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-tracker-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nroadmap — x\nhooks — x\nguardrail — x\n');
  return dir;
}
const adopt = (dir, answers) => applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-10-11' }) });
const guardrail = (dir) => collectEnforcement(dir).filter((e) => e.guardrail === 'tracker-writes-follow-the-answer');

test('the tracker pack is a valid SDLC pack with no component', () => {
  assert.deepEqual(validatePack(loadPackSchema(root), pack, { dirName: 'tracker' }), []);
  assert.equal(pack.family, 'sdlc');
  assert.equal(pack.components, undefined);
});

test('files is the recommended answer and renders one decision, no guardrail, and writes stay off', () => {
  const recommended = Object.fromEntries(pack.questions.filter((q) => q.options).map((q) => [q.id, q.options.find((o) => o.recommended).id]));
  assert.equal(recommended.tracker, 'files');
  const dir = project();
  try {
    adopt(dir, { tracker: 'files' });
    assert.equal(adoptedData(dir, 'tracker'), 'files');
    assert.equal(guardrail(dir).length, 0);
    assert.equal(existsSync(path.join(dir, 'docs/guardrails')) && readdirSync(path.join(dir, 'docs/guardrails')).length > 0, false);
    assert.equal(writeMode(dir), 'off', 'no write answer: the CLI refuses writes');
    assert.deepEqual(activeQuestions(pack, withFallbacks(pack, { tracker: 'files' })).map((q) => q.id), ['tracker']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('github with ask renders the write answer for the CLI and a tier-2 gate on the three verbs, by what a call runs', () => {
  const dir = project();
  try {
    adopt(dir, github);
    assert.equal(adoptedData(dir, 'tracker'), 'github');
    assert.equal(writeMode(dir), 'ask');
    const entries = guardrail(dir);
    assert.deepEqual(entries.map((e) => e.tier), [2, 1]);
    assert.equal(entries[0].parsed.id, 'gate-command');
    assert.equal(entries[0].parsed.args.classes, '');
    assert.equal(entries[0].parsed.args['go-getter'], 'plan issue create,plan issue comment,plan issue close');
    const gated = gateEntries(entries, { project: dir });
    assert.deepEqual(gated.map((g) => g.identity.join(' ')), ['plan issue create', 'plan issue comment', 'plan issue close']);
    const caps = loadCapabilities(root);
    // a host whose hook can ask needs no glob: the hook prompts for every spelling
    assert.deepEqual(nativeRules('claude-code', gated, caps), []);
    // a host with native rules but a hook that cannot ask gets the usual spellings
    const kilo = nativeRules('kilo', gated, caps);
    for (const spelling of ['go-getter', '.go-getter/bin/go-getter', 'npx go-getter', 'npx -y go-getter']) assert.ok(kilo[`${spelling} plan issue create *`], spelling);
    assert.equal(kilo['go-getter plan issue --dry-run create *'], undefined, 'a dry run is never matched');
    assert.equal(Object.keys(kilo).length, 15, 'five spellings of three verbs');
    const gate = (c) => matchGated(c, { classes: [], extra: [] }).length;
    assert.equal(gate('git push'), 0, 'the gate lists no class, so no catalog command is added to hitl');
    writeFileSync(path.join(dir, 'x'), '');
    mkdirSync(path.join(dir, 'compiler/bin'), { recursive: true });
    writeFileSync(path.join(dir, 'compiler/bin/go-getter.mjs'), '');
    assert.ok(nativeRules('kilo', gateEntries(entries, { project: dir }), caps)['node compiler/bin/go-getter.mjs plan issue close *'], 'a checkout adds its own spelling');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an answer file from 0.2.0 that still carries write-commands renders without error', () => {
  const dir = project();
  try {
    adopt(dir, { ...github, 'write-commands': ['go-getter plan issue create'] });
    assert.equal(guardrail(dir).length, 2);
    assert.ok(!readdirSync(path.join(dir, 'docs/decisions')).some((f) => /write-commands/.test(f)), 'no decision is rendered for the removed question');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('off and allow render the answer without a gate; off is advisory only', () => {
  for (const writes of ['off', 'allow']) {
    const dir = project();
    try {
      adopt(dir, { tracker: 'github', writes });
      assert.equal(writeMode(dir), writes);
      assert.deepEqual(guardrail(dir).map((e) => e.tier), [1]);
      assert.deepEqual(gateEntries(guardrail(dir)), []);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
});

const jira = { tracker: 'jira', 'jira-site': 'https://acme.atlassian.net', 'jira-auth': 'basic', 'jira-email-env': 'ACME_EMAIL', 'jira-token-env': 'ACME_TOKEN', 'jira-project': 'ACME', 'jira-issue-type': 'Story', 'jira-done-transition': 'Done', writes: 'ask' };

test('the jira path records every setting, the CLI reads the configuration back, and the answers read back', () => {
  const dir = project();
  try {
    adopt(dir, jira);
    assert.equal(adoptedData(dir, 'tracker'), 'jira');
    assert.deepEqual(jiraConfig(dir), { site: 'https://acme.atlassian.net', auth: 'basic', 'email-env': 'ACME_EMAIL', 'token-env': 'ACME_TOKEN', project: 'ACME', 'issue-type': 'Story', 'done-transition': 'Done' });
    assert.equal(checkConfig(jiraConfig(dir), { ACME_EMAIL: 'e', ACME_TOKEN: 't' }).base, 'https://acme.atlassian.net');
    assert.equal(writeMode(dir), 'ask');
    assert.deepEqual(gateEntries(guardrail(dir)).length, 3, 'the ask gate covers the three verbs for Jira too');
    const back = currentAnswers(adoptedArtifacts(dir, 'tracker'));
    for (const q of activeQuestions(pack, withFallbacks(pack, jira))) assert.deepEqual(back[q.id], jira[q.id], q.id);
    const text = readdirSync(path.join(dir, 'docs/decisions')).map((f) => readFileSync(path.join(dir, 'docs/decisions', f), 'utf8')).join('\n');
    assert.ok(!/ATATT|api[_-]?token\s*[:=]/i.test(text), 'only names of variables are recorded');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('empty optional Jira answers render and mean not set; the Jira questions are inactive for github and files', () => {
  const dir = project();
  try {
    adopt(dir, { ...jira, 'jira-site': '', 'jira-project': '', 'jira-done-transition': '' });
    assert.deepEqual([jiraConfig(dir).site, jiraConfig(dir).project, jiraConfig(dir)['done-transition']], ['', undefined, undefined]);
    assert.throws(() => checkConfig(jiraConfig(dir), {}), /Jira site is not set/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  for (const tracker of ['files', 'github']) {
    assert.ok(!activeQuestions(pack, withFallbacks(pack, { tracker, writes: 'off' })).some((q) => q.id.startsWith('jira-')), tracker);
  }
});

test('an answer file from 0.1.0 renders unchanged: no Jira settings, no new decision for them', () => {
  const dir = project();
  try {
    adopt(dir, github);
    assert.equal(adoptedData(dir, 'tracker-jira-site'), undefined);
    assert.equal(jiraConfig(dir), null);
    assert.ok(!readdirSync(path.join(dir, 'docs/decisions')).some((f) => /jira/.test(f)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('golden: the artifacts of the github path with ask', () => {
  const dir = project();
  try {
    const plan = planRender({ root: dir, pack, answers: github, acceptedBy: 'tester', date: '2026-10-11' });
    applyRender({ root: dir, plan });
    const actual = Object.fromEntries(plan.artifacts.map((a) => [a.path, readFileSync(path.join(dir, a.path), 'utf8')]).sort());
    if (process.env.UPDATE_GOLDEN) writeFileSync(goldenFile, `${JSON.stringify(actual, null, 2)}\n`);
    assert.deepEqual(actual, JSON.parse(readFileSync(goldenFile, 'utf8')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
