// A project adopted at any released `governance` version moves to the three packs that replaced it (decision 0132):
// the pack as released is adopted with the recommended answers, then updated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { planRender, applyRender } from '../src/render.mjs';
import { adoptedPacks } from '../src/manifest.mjs';
import { adoptedArtifacts, currentAnswers } from '../src/reconfigure.mjs';
import { readArtifacts } from '../src/artifacts.mjs';
import { runUpdate } from '../src/update.mjs';
import { applyPlan, planApply } from '../src/apply.mjs';
import { collectEnforcement } from '../src/enforce.mjs';
import { GOVERNANCE_IDS } from './support/governance-packs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// The retired pack at each release that shipped it, copied from git (`git show v0.2.0:src/packs/governance/pack.json`,
// `git show v0.3.1:...`). The set is closed: no later governance version exists. Files, not tags, so a shallow checkout works.
const versions = ['0.2.0', '0.5.0'].map((version) => ({ pack: JSON.parse(readFileSync(path.join(root, `compiler/test/fixtures/governance/${version}.json`), 'utf8')) }));

const TAGS = '# Tags\n\npractice-packs — x\ngovernance — x\nsecurity — x\nmodel-routing — x\nenforcement — x\nobservability — x\nguardrail — x\n';
const answersOf = (pack, overrides = {}) => ({
  ...Object.fromEntries(pack.questions.filter((q) => q.options).map((q) => [q.id, q.options.find((o) => o.recommended).id])),
  'restricted-paths': ['.env', '*.pem', 'secrets/'],
  'restricted-modes': [],
  ...overrides,
});

function adopted(pack, overrides) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-gov-split-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), TAGS);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  applyRender({ root: dir, plan: planRender({ root: dir, pack, answers: answersOf(pack, overrides), acceptedBy: 't', date: '2026-10-05', detect: {} }) });
  applyPlan(dir, planApply(dir));
  return dir;
}

const snapshot = (dir) => Object.fromEntries(['decisions', 'guardrails'].flatMap((d) => readdirSync(path.join(dir, 'docs', d)).map((f) => [`${d}/${f}`, readFileSync(path.join(dir, 'docs', d, f), 'utf8')])));
// The rules a project enforces, without the provenance label that the update rewrites.
// Guardrails of questions added after the split (the mcp-* ones) are not part of what the split must preserve.
const enforcement = (dir) => JSON.stringify(collectEnforcement(dir).filter((e) => !/^mcp-/.test(e.guardrail)).map((e) => ({ ...e, 'generated-by': undefined })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

for (const { pack } of versions) {
  test(`the provider of internal-data: single-provider is kept when governance ${pack.version} updates (issue 147)`, () => {
    const dir = adopted(pack, { 'internal-data': 'single-provider', provider: 'openai' });
    try {
      const { notes } = runUpdate(dir, { root, date: '2026-10-11' });
      assert.deepEqual(notes.filter((n) => /no recorded answer|taken over/.test(n)), []);
      const policy = adoptedArtifacts(dir, 'data-policy');
      assert.equal(currentAnswers(policy).provider, 'openai');
      assert.match(readFileSync(path.join(dir, policy.find((a) => a.data['go-getter']['pack-answer'] === 'internal-data').file), 'utf8'), /openai/);
      const before = snapshot(dir);
      runUpdate(dir, { root, date: '2026-10-12' });
      assert.deepEqual(snapshot(dir), before, 'a second update changes nothing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('the fixtures are the released governance versions', () => {
  assert.deepEqual(versions.map((v) => v.pack.version), ['0.2.0', '0.5.0']);
});

for (const { pack } of versions) {
  test(`a project adopted at governance ${pack.version} (fixture) updates to the new packs with the same answers and enforcement`, () => {
    const dir = adopted(pack);
    try {
      assert.deepEqual(adoptedPacks(dir), { governance: pack.version });
      const answers = currentAnswers(adoptedArtifacts(dir, 'governance'));
      const rules = enforcement(dir);

      const { notes } = runUpdate(dir, { root, date: '2026-10-11' });

      assert.deepEqual(notes.filter((n) => /taken over|no recorded answer|not in this go-getter/.test(n)), [], 'nothing is asked again or left behind');
      const packs = adoptedPacks(dir);
      assert.equal(packs.governance, undefined, 'the retired pack is no longer adopted');
      const now = Object.assign({}, ...GOVERNANCE_IDS.filter((id) => packs[id]).map((id) => currentAnswers(adoptedArtifacts(dir, id))));
      for (const [q, v] of Object.entries(answers)) assert.deepEqual(now[q], v, `answer ${q} is kept`);
      assert.equal(enforcement(dir), rules, 'the same rules are enforced');
      for (const a of readArtifacts(dir).filter((x) => x.data['go-getter']?.['pack-answer'])) {
        assert.match(a.data['go-getter']['generated-by'], new RegExp(`^(${GOVERNANCE_IDS.join('|')})@`), `${a.id} belongs to a new pack`);
      }

      const before = snapshot(dir);
      const again = runUpdate(dir, { root, date: '2026-10-12' });
      assert.deepEqual(again.notes.filter((n) => /taken over|no recorded answer/.test(n)), []);
      assert.deepEqual(snapshot(dir), before, 'a second update changes nothing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('render-pack and reconfigure on the retired pack id say where its questions went, and the old answers file works for each new pack', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-gov-retired-'));
  try {
    mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
    writeFileSync(path.join(dir, 'docs/skills/tags.md'), TAGS);
    const file = path.join(dir, 'answers.json');
    writeFileSync(file, JSON.stringify({ answers: answersOf(versions[1].pack), acceptedBy: 't', date: '2026-10-11' }));
    const bin = path.join(root, 'compiler/bin/go-getter.mjs');
    for (const command of ['render-pack', 'reconfigure']) {
      const run = spawnSync('node', [bin, command, 'governance', '--answers', file, '--project', dir, '--dry-run'], { encoding: 'utf8' });
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, /pack "governance" was split into/);
      for (const id of GOVERNANCE_IDS) assert.match(run.stderr, new RegExp(id));
    }
    for (const id of GOVERNANCE_IDS) {
      const run = spawnSync('node', [bin, 'render-pack', id, '--answers', file, '--project', dir, '--dry-run'], { encoding: 'utf8' });
      assert.equal(run.status, 0, run.stderr);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
