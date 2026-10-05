import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadPack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { loadCapabilities } from '../src/capabilities.mjs';
import { coverage, formatCoverage } from '../src/coverage.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const example = loadPack(path.join(here, 'fixtures/packs/example/pack.json'));
const guard = {
  id: 'guard',
  version: '0.1.0',
  family: 'harness',
  components: [3, 7],
  title: 'Guard fixture',
  summary: 'Blocks secrets at tier 2.',
  questions: [{ id: 'block', prompt: 'Block secrets?', options: [{ id: 'yes', label: 'Yes', tradeoff: 'safe', recommended: true }, { id: 'no', label: 'No', tradeoff: 'risky' }] }],
  outputs: {
    block: {
      yes: {
        decisions: [{ slug: 'block-secrets', title: 'Secrets are blocked', tags: ['configuration'], frontmatter: { track: 'process' }, body: 'x' }],
        guardrails: [
          {
            slug: 'no-secret-reads',
            title: 'Agents must not read secrets',
            tags: ['guardrail'],
            frontmatter: { 'governed-by': '{{id.decision.block}}', 'grounded-in': ['{{id.decision.block}}'], 'derivation-note': 'x' },
            enforcement: [{ tier: 2, check: 'deny', run: 'builtin:deny-path paths=.env' }],
            body: 'x',
          },
        ],
      },
    },
  },
};

function adoptBoth() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-coverage-'));
  const base = { root: dir, acceptedBy: 't', date: '2026-10-05' };
  applyRender({ root: dir, plan: planRender({ ...base, pack: example, answers: { 'instruction-cap': 'strict', 'enforce-cap': 'yes' } }) });
  applyRender({ root: dir, plan: planRender({ ...base, pack: guard, answers: { block: 'yes' } }) });
  return dir;
}

test('coverage maps components to adopted packs and per-host tiers', () => {
  const dir = adoptBoth();
  const rows = coverage(dir, { example, guard }, loadCapabilities(root));
  const byNum = Object.fromEntries(rows.map((r) => [r.component, r]));
  assert.equal(rows.length, 12);
  assert.deepEqual(byNum[4].packs, ['example@0.1.0']);
  assert.deepEqual(new Set(Object.values(byNum[4].tiers)), new Set([3]));
  assert.deepEqual(byNum[7].packs, ['guard@0.1.0']);
  assert.deepEqual(new Set(Object.values(byNum[7].tiers)), new Set([2]));
  // Kilo and OpenCode have no sandbox lever (capability tier 0), so the tier-2 rule is advisory there.
  assert.equal(byNum[3].tiers.kilo, 1);
  assert.equal(byNum[3].tiers.opencode, 1);
  assert.equal(byNum[3].tiers['claude-code'], 2);
  assert.deepEqual(byNum[1].packs, []);
  assert.equal(byNum[1].tiers['claude-code'], null);
  const text = formatCoverage(rows);
  assert.match(text, /^4 Context management\s+example@0\.1\.0\s+ci\s+ci/m);
  assert.match(text, /^3 Execution sandbox\s+guard@0\.1\.0\s+hook\s+hook\s+advisory/m);
  assert.match(text, /^1 Orchestration loop\s+none\s+-/m);
  rmSync(dir, { recursive: true, force: true });
});

test('coverage CLI lists every component on this repo, uncovered ones as none', () => {
  const res = spawnSync(process.execPath, [path.join(root, 'compiler/bin/go-getter.mjs'), 'coverage', '--project', root, '--json'], { encoding: 'utf8' });
  const rows = JSON.parse(res.stdout);
  assert.equal(rows.length, 12);
  assert.deepEqual(rows.map((r) => r.component), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});
