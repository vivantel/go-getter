// Every adopted pack's answers must be recoverable from the artifacts it rendered (reconfigure and update read them
// back); a question that renders no decision leaves its answer recorded nowhere, and update then cannot re-render.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadPack } from '../src/packs.mjs';
import { planRender, applyRender, activeQuestions, withFallbacks } from '../src/render.mjs';
import { adoptedArtifacts, currentAnswers } from '../src/reconfigure.mjs';
import { runUpdate } from '../src/update.mjs';
import { applyPlan, planApply } from '../src/apply.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const packIds = readdirSync(path.join(root, 'src/packs')).sort();

// The recommended answer to every question; a text or list question takes its default, or a sample of its shape.
function recommended(pack) {
  const answers = {};
  for (const q of pack.questions) {
    if (q.options) {
      const rec = q.options.filter((o) => o.recommended).map((o) => o.id);
      answers[q.id] = q.multi ? rec : rec[0];
    } else {
      answers[q.id] = q.default ?? (q.type === 'list' ? [] : '');
    }
  }
  return answers;
}

function project(tags) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-roundtrip-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), `# Tags\n\n${[...tags].map((t) => `${t} — x`).join('\n')}\n`);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

for (const id of packIds) {
  test(`pack ${id}: the recommended answers can be read back from what it renders`, () => {
    const pack = loadPack(path.join(root, 'src/packs', id, 'pack.json'));
    const answers = recommended(pack);
    const tags = new Set(JSON.stringify(pack.outputs).match(/"tags":\s*\[[^\]]*\]/g)?.flatMap((m) => JSON.parse(`{${m}}`).tags) ?? []);
    const dir = project(tags);
    try {
      applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-10-10', detect: {} }) });
      const back = currentAnswers(adoptedArtifacts(dir, id));
      const active = activeQuestions(pack, withFallbacks(pack, answers));
      for (const q of active) {
        assert.notEqual(back[q.id], undefined, `question "${q.id}" renders no artifact that records its answer`);
        assert.deepEqual(back[q.id], answers[q.id], `question "${q.id}" reads back differently`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}

test('update leaves a pack whose answers are not recorded as it is, says how to fix it, and carries on', () => {
  const dir = project(['practice-packs', 'hooks', 'guardrail']);
  const fake = mkdtempSync(path.join(tmpdir(), 'gg-roundtrip-root-'));
  try {
    mkdirSync(path.join(fake, 'src/packs'), { recursive: true });
    cpSync(path.join(root, 'src/packs/checkpointing'), path.join(fake, 'src/packs/checkpointing'), { recursive: true });
    const pack = loadPack(path.join(root, 'src/packs/checkpointing/pack.json'));
    applyRender({ root: dir, plan: planRender({ root: dir, pack, answers: recommended(pack), acceptedBy: 't', date: '2026-10-10' }) });
    // What a project adopted before the fix has: no decision for triggers or retention.
    for (const f of readdirSync(path.join(dir, 'docs/decisions'))) {
      if (/checkpoint-(trigger|retention)/.test(f)) rmSync(path.join(dir, 'docs/decisions', f));
    }
    const index = path.join(dir, 'docs/decisions/INDEX.md');
    writeFileSync(index, readFileSync(index, 'utf8').split('\n').filter((l) => !/checkpoint-(trigger|retention)/.test(l)).join('\n'));
    applyPlan(dir, planApply(dir));
    const { notes } = runUpdate(dir, { root: fake, date: '2026-10-11' });
    const note = notes.find((n) => n.startsWith('pack checkpointing:'));
    assert.match(note, /no recorded answer for triggers, retention/);
    assert.match(note, /reconfigure checkpointing --current/);
    assert.match(note, /reconfigure checkpointing --answers/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fake, { recursive: true, force: true });
  }
});

test('update does not reset an unrecorded answer to the default of a question the project already had', () => {
  const dir = project(['practice-packs', 'hooks', 'guardrail']);
  const fake = mkdtempSync(path.join(tmpdir(), 'gg-roundtrip-root-'));
  try {
    mkdirSync(path.join(fake, 'src/packs'), { recursive: true });
    cpSync(path.join(root, 'src/packs/hitl'), path.join(fake, 'src/packs/hitl'), { recursive: true });
    const pack = loadPack(path.join(root, 'src/packs/hitl/pack.json'));
    applyRender({ root: dir, plan: planRender({ root: dir, pack, answers: { ...recommended(pack), 'extra-patterns': ['make deploy'] }, acceptedBy: 't', date: '2026-10-10' }) });
    for (const f of readdirSync(path.join(dir, 'docs/decisions'))) if (/gated-extra-patterns/.test(f)) rmSync(path.join(dir, 'docs/decisions', f));
    const index = path.join(dir, 'docs/decisions/INDEX.md');
    writeFileSync(index, readFileSync(index, 'utf8').split('\n').filter((l) => !/gated-extra-patterns/.test(l)).join('\n'));
    applyPlan(dir, planApply(dir));
    const before = readFileSync(path.join(dir, 'docs/guardrails/gated-actions-need-human-approval.md'), 'utf8');
    assert.match(before, /make deploy/);
    const { notes } = runUpdate(dir, { root: fake, date: '2026-10-11' });
    assert.match(notes.find((n) => n.startsWith('pack hitl:')), /no recorded answer for extra-patterns/);
    assert.equal(readFileSync(path.join(dir, 'docs/guardrails/gated-actions-need-human-approval.md'), 'utf8'), before, 'the custom pattern is still there');
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(fake, { recursive: true, force: true });
  }
});
