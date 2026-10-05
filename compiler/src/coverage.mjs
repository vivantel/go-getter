// Harness coverage report (plan 4.6, fitness function of decision 0008): for each of the 12 harness
// components (fact 0002), the adopted packs covering it and the strongest tier reached on each host.
import { readArtifacts } from './artifacts.mjs';
import { HOSTS } from './capabilities.mjs';

export const COMPONENTS = {
  1: 'Orchestration loop',
  2: 'Tool registry',
  3: 'Execution sandbox',
  4: 'Context management',
  5: 'Memory',
  6: 'Verification loops',
  7: 'Guardrails & DLP',
  8: 'Human-in-the-loop',
  9: 'Checkpointing',
  10: 'Multi-agent orchestration',
  11: 'Cost & model routing',
  12: 'Observability',
};

// packs: { id: packJson }; caps: { host: capabilities }.
export function coverage(project, packs, caps, hosts = HOSTS) {
  const guardrails = readArtifacts(project, ['guardrails']).filter((g) => g.data.status === 'active');
  const adopted = new Map();
  for (const a of readArtifacts(project)) {
    const by = a.data['go-getter']?.['generated-by'];
    if (a.data.status === 'active' && by) adopted.set(by.split('@')[0], by);
  }
  return Object.entries(COMPONENTS).map(([num, name]) => {
    const c = Number(num);
    const covering = [...adopted.keys()].filter((id) => packs[id]?.components?.includes(c)).sort();
    const entries = guardrails
      .filter((g) => covering.includes(String(g.data['go-getter']?.['generated-by'] ?? '').split('@')[0]))
      .flatMap((g) => g.data['go-getter'].enforcement ?? []);
    const tiers = Object.fromEntries(
      hosts.map((h) => {
        if (!entries.length) return [h, null];
        const reach = caps[h]?.tiers?.[String(c)] ?? 2;
        return [h, Math.max(...entries.map((e) => (e.tier === 3 ? 3 : e.tier === 2 ? (reach >= 2 ? 2 : 1) : 1)))];
      }),
    );
    return { component: c, name, packs: covering.map((id) => adopted.get(id)), tiers };
  });
}

const LABEL = { 3: 'ci', 2: 'hook', 1: 'advisory' };

export function formatCoverage(rows, hosts = HOSTS) {
  const header = ['component', 'packs', ...hosts];
  const body = rows.map((r) => [`${r.component} ${r.name}`, r.packs.length ? r.packs.join(', ') : 'none', ...hosts.map((h) => (r.tiers[h] ? LABEL[r.tiers[h]] : '-'))]);
  const widths = header.map((_, i) => Math.max(...[header, ...body].map((row) => row[i].length)));
  return [header, ...body].map((row) => row.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd()).join('\n');
}
