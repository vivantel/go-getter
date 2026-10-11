// The three packs that replaced `governance` (decision 0132), for tests written against the old single pack.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack } from '../../src/packs.mjs';
import { planRender, applyRender } from '../../src/render.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const GOVERNANCE_IDS = ['restricted-data', 'sanitization', 'data-policy'];
export const governancePacks = GOVERNANCE_IDS.map((id) => loadPack(path.join(root, `src/packs/${id}/pack.json`)));
// All their questions in one list, as the old pack had them.
export const pack = { id: 'governance', version: governancePacks[0].version, questions: governancePacks.flatMap((p) => p.questions) };

export const planGovernance = ({ root: project, answers, ...rest }) =>
  governancePacks.map((p) => planRender({ root: project, pack: p, answers: Object.fromEntries(p.questions.filter((q) => answers[q.id] !== undefined).map((q) => [q.id, answers[q.id]])), ...rest }));

// Adopts the three packs one after the other with one answer set.
export function adoptGovernance(project, answers, { acceptedBy = 't', date = '2026-10-05' } = {}) {
  for (const plan of planGovernance({ root: project, answers, acceptedBy, date })) applyRender({ root: project, plan });
}
