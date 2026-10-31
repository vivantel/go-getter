// Every option of every choice question must be readable back from what the pack renders, not only the recommended ones:
// update recovers answers from the artifacts, and an answer that renders nothing sends the owner back to the interview.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadPack } from '../src/packs.mjs';
import { planRender, applyRender, activeQuestions, withFallbacks } from '../src/render.mjs';
import { adoptedArtifacts, currentAnswers } from '../src/reconfigure.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const packIds = readdirSync(path.join(root, 'src/packs')).sort();

function baseline(pack) {
  const answers = {};
  for (const q of pack.questions) {
    if (q.options) {
      const rec = q.options.filter((o) => o.recommended).map((o) => o.id);
      answers[q.id] = q.multi ? rec : rec[0];
    } else answers[q.id] = q.default ?? (q.type === 'list' ? [] : '');
  }
  return answers;
}

// Answers the pack's questions could take that differ from the baseline: each other option of a choice question, with the
// questions it opens answered by their recommended option or a sample value.
function variants(pack) {
  const out = [];
  for (const q of pack.questions) {
    if (q.options) {
      for (const o of q.options.filter((x) => !x.recommended)) out.push({ label: `${q.id}=${o.id}`, answers: { ...baseline(pack), [q.id]: q.multi ? [o.id] : o.id } });
    } else if (q.pattern) continue;
    else if (q.type === 'list') out.push({ label: `${q.id}=[sample]`, answers: { ...baseline(pack), [q.id]: ['sample-one', 'sample-two'] } });
    else out.push({ label: `${q.id}=sample`, answers: { ...baseline(pack), [q.id]: 'sample' } });
  }
  return out;
}

function project(tags) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-variants-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), `# Tags\n\n${[...tags].map((t) => `${t} — x`).join('\n')}\n`);
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  return dir;
}

for (const id of packIds) {
  test(`pack ${id}: every other option and a sample text or list answer reads back`, () => {
    const pack = loadPack(path.join(root, 'src/packs', id, 'pack.json'));
    const tags = new Set(JSON.stringify(pack.outputs).match(/"tags":\s*\[[^\]]*\]/g)?.flatMap((m) => JSON.parse(`{${m}}`).tags) ?? []);
    const lost = [];
    for (const { label, answers } of variants(pack)) {
      const dir = project(tags);
      try {
        applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-10-10', detect: {} }) });
        const back = currentAnswers(adoptedArtifacts(dir, id));
        for (const q of activeQuestions(pack, withFallbacks(pack, answers))) {
          if (JSON.stringify(back[q.id]) !== JSON.stringify(answers[q.id])) lost.push(`${label}: "${q.id}" reads back as ${JSON.stringify(back[q.id])}, not ${JSON.stringify(answers[q.id])}`);
        }
      } catch (err) {
        lost.push(`${label}: ${err.message}`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    assert.deepEqual(lost, []);
  });
}

test('pack hitl: a non-empty MCP server allowlist reads back in order', () => {
  const pack = loadPack(path.join(root, 'src/packs/hitl/pack.json'));
  const dir = project(new Set(['practice-packs', 'hooks', 'guardrail']));
  try {
    const answers = { ...baseline(pack), 'mcp-policy': 'allowlist', 'mcp-servers': ['github', 'linear'], 'mcp-read-tools': ['github:get_issue'] };
    applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-10-10', detect: {} }) });
    const back = currentAnswers(adoptedArtifacts(dir, 'hitl'));
    assert.deepEqual(back['mcp-servers'], ['github', 'linear']);
    assert.deepEqual(back['mcp-read-tools'], ['github:get_issue']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
