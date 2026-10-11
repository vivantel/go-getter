// A project adopted at any released `governance` version moves to the three packs that replaced it (decision 0132):
// the pack is rebuilt from git at each release tag, adopted with the recommended answers, then updated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { planRender, applyRender } from '../src/render.mjs';
import { adoptedPacks } from '../src/manifest.mjs';
import { adoptedArtifacts, currentAnswers } from '../src/reconfigure.mjs';
import { readArtifacts } from '../src/artifacts.mjs';
import { runUpdate } from '../src/update.mjs';
import { applyPlan, planApply } from '../src/apply.mjs';
import { collectEnforcement } from '../src/enforce.mjs';
import { GOVERNANCE_IDS } from './support/governance-packs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 });
const releases = git('tag', '--list', 'v*').split('\n').filter(Boolean).flatMap((tag) => {
  try {
    return [{ tag, pack: JSON.parse(git('show', `${tag}:src/packs/governance/pack.json`)) }];
  } catch {
    return []; // a release from before the pack existed
  }
});
// One entry per governance version: the pack at its latest tag.
const versions = [...new Map(releases.map((r) => [r.pack.version, r])).values()];

const TAGS = '# Tags\n\npractice-packs — x\ngovernance — x\nsecurity — x\nmodel-routing — x\nenforcement — x\nobservability — x\nguardrail — x\n';
const answersOf = (pack) => ({
  ...Object.fromEntries(pack.questions.filter((q) => q.options).map((q) => [q.id, q.options.find((o) => o.recommended).id])),
  'restricted-paths': ['.env', '*.pem', 'secrets/'],
  'restricted-modes': [],
});

function adopted(pack) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-gov-split-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), TAGS);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  applyRender({ root: dir, plan: planRender({ root: dir, pack, answers: answersOf(pack), acceptedBy: 't', date: '2026-10-05', detect: {} }) });
  applyPlan(dir, planApply(dir));
  return dir;
}

const snapshot = (dir) => Object.fromEntries(['decisions', 'guardrails'].flatMap((d) => readdirSync(path.join(dir, 'docs', d)).map((f) => [`${d}/${f}`, readFileSync(path.join(dir, 'docs', d, f), 'utf8')])));
// The rules a project enforces, without the provenance label that the update rewrites.
const enforcement = (dir) => JSON.stringify(collectEnforcement(dir).map((e) => ({ ...e, 'generated-by': undefined })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));

test('the released governance versions are found in git history', () => {
  assert.ok(versions.length >= 2, `found ${versions.map((v) => v.pack.version)}; fetch the tags (git fetch --tags)`);
});

for (const { tag, pack } of versions) {
  test(`a project adopted at governance ${pack.version} (${tag}) updates to the new packs with the same answers and enforcement`, () => {
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
