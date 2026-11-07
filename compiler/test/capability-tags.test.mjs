import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { cleanGitEnv } from '../src/git-env.mjs';
import { parsePlan } from '../src/plan.mjs';
import { nextUnits } from '../src/work/next.mjs';
import { intakeProblems } from '../src/work/intake.mjs';
import { loadCapabilityTags, modelTags } from '../src/capability-tags.mjs';

const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: cleanGitEnv(process.env) }).trim();
const VOCAB = readFileSync(new URL('../../docs/skills/capabilities.md', import.meta.url), 'utf8');

const PLAN = `# Feature
Owner-id: dana

### T1 Plain — [ ]
Class: implement · Needs: none · Scope: src/a/** · Check: \`true\`
Do: no tags.

### T2 Robot — [ ]
Class: implement · Needs: none · Scope: src/b/** · Needs-capability: manipulator · Check: \`true\`
Do: needs an actuator.

### T3 Eyes — [ ]
Class: implement · Needs: none · Scope: src/c/** · Needs-capability: vision, browser · Check: \`true\`
Do: needs vision and browser.

### T4 Bogus — [ ]
Class: implement · Needs: none · Scope: src/d/** · Needs-capability: telepathy · Check: \`true\`
Do: unknown tag.
`;

function repo(plan = PLAN) {
  const root = mkdtempSync(path.join(tmpdir(), 'captags-'));
  sh(root, 'init', '-q', '-b', 'main');
  mkdirSync(path.join(root, 'docs', 'plans'), { recursive: true });
  mkdirSync(path.join(root, 'docs', 'skills'), { recursive: true });
  writeFileSync(path.join(root, 'docs', 'plans', 'feat.md'), plan);
  writeFileSync(path.join(root, 'docs', 'skills', 'capabilities.md'), VOCAB);
  sh(root, 'add', '-A');
  sh(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  return root;
}
const offered = (root, has) => nextUnits(root, { has }).ready.map((r) => r.id);

test('parser reads Needs-capability', () => {
  const p = parsePlan(PLAN, 'feat.md');
  assert.deepEqual(p.steps.find((s) => s.id === 'T3').needsCapability, ['vision', 'browser']);
  assert.equal(p.steps.find((s) => s.id === 'T1').needsCapability, undefined);
  assert.deepEqual(p.problems, []);
});

test('a unit with an unmet tag is never offered', () => {
  const root = repo();
  assert.deepEqual(offered(root, []), ['T1']);
  assert.deepEqual(offered(root, undefined), ['T1'], 'a worker that declares no capabilities holds none');
  assert.deepEqual(offered(root, ['manipulator']).sort(), ['T1', 'T2']);
  assert.deepEqual(offered(root, ['vision']).sort(), ['T1']);
  assert.deepEqual(offered(root, ['vision', 'browser', 'manipulator']).sort(), ['T1', 'T2', 'T3']);
  const skipped = nextUnits(root, { has: [] }).skipped.find((s) => s.unit.endsWith('T2'));
  assert.match(skipped.reason, /needs capability manipulator/);
});

test('an unknown tag is refused at approval and never offered', () => {
  const root = repo();
  const parsed = parsePlan(PLAN, 'feat.md');
  const vocab = loadCapabilityTags(root);
  const t4 = parsed.steps.find((s) => s.id === 'T4');
  assert.match(intakeProblems(t4, parsed, vocab).join(';'), /unknown capability "telepathy"/);
  assert.deepEqual(intakeProblems(parsed.steps.find((s) => s.id === 'T2'), parsed, vocab).filter((p) => /capability/.test(p)), []);
  assert.ok(!offered(root, ['telepathy', 'manipulator', 'vision', 'browser']).includes('T4'));
});

test('the vocabulary marks model properties and no plan or tag names a model', () => {
  const vocab = loadCapabilityTags(repo());
  assert.deepEqual(modelTags(['vision', 'browser', 'long-context', 'tool-use'], vocab), ['vision', 'long-context', 'tool-use']);
  const ids = readdirSync(new URL('../../docs/facts', import.meta.url)).filter((f) => f.endsWith('.md'))
    .flatMap((f) => [...readFileSync(new URL(`../../docs/facts/${f}`, import.meta.url), 'utf8').matchAll(/\{id: ([\w.-]+),/g)].map((m) => m[1]));
  assert.ok(ids.length > 0);
  for (const tag of vocab.keys()) assert.ok(!ids.includes(tag), tag);
  const plans = readdirSync(new URL('../../docs/plans', import.meta.url)).filter((f) => f.endsWith('.md'));
  for (const f of plans) {
    const parsed = parsePlan(readFileSync(new URL(`../../docs/plans/${f}`, import.meta.url), 'utf8'), f);
    for (const s of parsed.steps) for (const t of s.needsCapability ?? []) assert.ok(vocab.has(t) && !ids.includes(t), `${f} ${s.id} ${t}`);
  }
});
