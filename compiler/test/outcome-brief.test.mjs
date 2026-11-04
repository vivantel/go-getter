// Plan discovery-and-outcomes D2 (decision 0178 item 1): `go-getter outcome check` refuses an incomplete brief by field name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { outcomeProblems } from '../src/outcome.mjs';
import { collectEnforcement } from '../src/enforce.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = path.join(repo, 'compiler/bin/go-getter.mjs');

const FULL = {
  id: 'faster-checkout',
  title: 'Faster checkout',
  status: 'draft',
  hypothesis: '"A shorter form raises completion"',
  meters: '[checkout-completion]',
  target: '"completion >= 62%"',
  window: '28 days',
  attribution: '"10% holdout on the old form"',
  constraints: '"no new data collected"',
  budget: '"200 units"',
  'effect-caps': '"none"',
  'review-cadence': 'weekly',
};

function project(overrides = {}, { meters = ['checkout-completion'] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-outcome-'));
  mkdirSync(path.join(dir, 'docs/outcomes'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/meters'), { recursive: true });
  for (const m of meters) writeFileSync(path.join(dir, 'docs/meters', `${m}.md`), `---\nid: ${m}\ntitle: ${m}\n---\n`);
  const fields = { ...FULL, ...overrides };
  const lines = Object.entries(fields).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`);
  writeFileSync(path.join(dir, 'docs/outcomes/faster-checkout.md'), `---\n${lines.join('\n')}\n---\n\n## Evidence\n\nNone yet.\n`);
  return dir;
}
const cli = (dir, ...args) => spawnSync(process.execPath, [bin, 'outcome', ...args], { cwd: dir, encoding: 'utf8' });

test('a complete brief passes', () => {
  const dir = project();
  try {
    assert.deepEqual(outcomeProblems(dir), []);
    const r = cli(dir, 'check', 'faster-checkout');
    assert.equal(r.status, 0, r.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const [field, named] of [['meters', 'meter'], ['target', 'target'], ['window', 'window'], ['attribution', 'attribution']]) {
  test(`a brief missing its ${field} is refused by name`, () => {
    for (const blank of [null, '""']) {
      const dir = project({ [field]: blank });
      try {
        const problems = outcomeProblems(dir, 'faster-checkout');
        assert.equal(problems.length, 1, problems.join('\n'));
        assert.match(problems[0], new RegExp(`missing ${named}\\b`));
        const r = cli(dir, 'check');
        assert.equal(r.status, 1);
        assert.match(r.stderr, new RegExp(`missing ${named}\\b`));
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
  });
}

test('a meter with no docs/meters file is refused', () => {
  const dir = project({}, { meters: [] });
  try {
    const r = cli(dir, 'check', 'faster-checkout');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown meter "checkout-completion"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a meter id cannot escape docs/meters', () => {
  const dir = project({ meters: '["../outcomes/faster-checkout"]' });
  try { assert.match(outcomeProblems(dir).join('\n'), /unknown meter/); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an unknown id or a bad subcommand fails', () => {
  const dir = project();
  try {
    assert.equal(cli(dir, 'check', 'nope').status, 1);
    assert.equal(cli(dir, 'bogus').status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('this repo declares the guardrail at tier 2 with a run', () => {
  const mine = collectEnforcement(repo).filter((e) => e.guardrail === 'an-outcome-needs-an-attribution-method');
  assert.ok(mine.some((e) => e.tier === 2 && e.run));
});

test('a brief with unreadable frontmatter is refused by name, not crashed on', () => {
  const dir = project();
  try {
    writeFileSync(path.join(dir, 'docs/outcomes/broken.md'), '---\nid: [oops\n---\nbody\n');
    const problems = outcomeProblems(dir, 'broken');
    assert.equal(problems.length, 1);
    assert.match(problems[0], /broken\.md: unreadable frontmatter/);
    assert.equal(cli(dir, 'check', 'broken').status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
