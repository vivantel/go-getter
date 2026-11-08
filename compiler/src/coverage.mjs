// Harness coverage report (plan 4.6, fitness function of decision 0008): for each of the 12 harness
// components (fact 0002), the adopted packs covering it and the strongest tier reached on each host.
import { readArtifacts } from './artifacts.mjs';
import { collectEnforcement } from './enforce.mjs';
import { readWorkers } from './work/grant.mjs';
import { STATEFUL } from './gate-state.mjs';
import { hostIds, deferredHosts } from './hosts/registry.mjs';

const HOSTS = hostIds();

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
    // In-host enforcement apart from CI: a host that cannot reach tier 2 is advisory there.
    const inHost = Object.fromEntries(
      hosts.map((h) => [h, entries.some((e) => e.tier === 2) && (caps[h]?.tiers?.[String(c)] ?? 2) >= 2 ? 2 : null]),
    );
    const row = { component: c, name, packs: covering.map((id) => adopted.get(id)), tiers, inHost };
    // The host's own restore command for what its native checkpoint covers (file edits), beside `go-getter checkpoint restore`.
    // Tool-output masking (component 7, decision 0106): where the host can replace tool output, and what is masked there.
    if (c === 7) {
      const canReplace = hosts.filter((h) => caps[h]?.hooks?.rewriteOutput === true);
      // Hosts that replace MCP results only (capability hooks.rewriteMcpOutput): masked there for MCP tools, not for others.
      const mcpOnly = hosts.filter((h) => !canReplace.includes(h) && caps[h]?.hooks?.rewriteMcpOutput === true);
      const inHostEntries = entries.filter((e) => e.tier === 2);
      row.outputMasking = {
        secrets: inHostEntries.length ? canReplace : [],
        pii: inHostEntries.some((e) => /^builtin:redact-pii\b/.test(e.run ?? '')) ? canReplace : [],
        none: inHostEntries.length ? hosts.filter((h) => !canReplace.includes(h)) : [],
        mcpOnly: inHostEntries.some((e) => /^builtin:mcp-(allow|scan)\b/.test(e.run ?? '')) ? mcpOnly : [],
      };
    }
    // How a state-dependent command is decided on each host (decision 0159): the hook asks, the hook hands over, or the floor lets it run.
    if (c === 8 && entries.some((e) => e.tier === 2 && /^builtin:gate-command\b/.test(e.run ?? ''))) {
      row.stateTiers = Object.fromEntries(hosts.map((h) => [h, caps[h]?.hooks?.gateFloor ? 'floor' : caps[h]?.hooks?.askPreTool ? 'ask' : 'hand-over']));
    }
    if (c === 9) row.nativeRestore = Object.fromEntries(hosts.filter((h) => caps[h]?.checkpointRestore).map((h) => [h, caps[h].checkpointRestore]));
    return row;
  });
}

const LABEL = { 3: 'ci', 2: 'hook', 1: 'advisory' };

// A host that blocks in-host and is also checked in CI reads "hook+ci".
export const cellLabel = (r, h) => (r.tiers[h] === 3 && r.inHost?.[h] === 2 ? 'hook+ci' : r.tiers[h] ? LABEL[r.tiers[h]] : '-');

export function formatCoverage(rows, hosts = HOSTS) {
  const header = ['component', 'packs', ...hosts];
  const body = rows.map((r) => [`${r.component} ${r.name}`, r.packs.length ? r.packs.join(', ') : 'none', ...hosts.map((h) => cellLabel(r, h))]);
  const widths = header.map((_, i) => Math.max(...[header, ...body].map((row) => row[i].length)));
  const table = [header, ...body].map((row) => row.map((cell, i) => cell.padEnd(widths[i])).join('  ').trimEnd()).join('\n');
  const lines = [table];
  const deferred = deferredHosts().filter((h) => hosts.includes(h));
  if (deferred.length) lines.push(`Deferred hosts: ${deferred.join(', ')} (reached through wrapper adapters over today's code; shapes marked ? in fact 0009 stay unconfirmed).`);
  const masking = rows.find((r) => r.component === 7)?.outputMasking;
  if (masking?.secrets.length) {
    const parts = [`secrets on ${masking.secrets.join(', ')}`];
    if (masking.pii.length) parts.push(`personal data on ${masking.pii.join(', ')}`);
    if (masking.none.length) parts.push(`not on ${masking.none.join(', ')} (the host cannot replace tool output)`);
    if (masking.mcpOnly?.length) parts.push(`MCP results alone on ${masking.mcpOnly.join(', ')} (the host replaces only those)`);
    lines.push(`Tool-output masking (component 7): ${parts.join('; ')}.`);
  }
  const states = rows.find((r) => r.component === 8)?.stateTiers;
  if (states) {
    const of = (tier) => hosts.filter((h) => states[h] === tier);
    const parts = [];
    if (of('ask').length) parts.push(`${of('ask').join(', ')} ask a person when the state shows work would be lost`);
    if (of('hand-over').length) parts.push(`${of('hand-over').join(', ')} stop and hand over to a person (the hook cannot ask)`);
    if (of('floor').length) parts.push(`${of('floor').join(', ')} run it after a checkpoint, with no stop (floor)`);
    lines.push(`State-dependent commands (${STATEFUL.join(', ')}): ${parts.join('; ')}.`);
    if (of('floor').length) {
      lines.push(`Residual risk on ${of('floor').join(', ')}: the floor is the git hooks plus a working-tree checkpoint, so a state-dependent command is not stopped even when the state shows work would be lost. Not protected: commits that exist only on a deleted or rebased branch (recoverable from the reflog until git collects them, not from the checkpoint, which holds the working tree) and the uncommitted files of a removed worktree (the checkpoint holds only the working tree the command runs in).`);
    }
  }
  const checkpoints = rows.find((r) => r.component === 9);
  if (!checkpoints?.packs.length) return lines.join('\n\n');
  const native = Object.entries(checkpoints.nativeRestore ?? {}).map(([h, cmd]) => `${h} ${cmd}`);
  lines.push(`Restore (component 9): go-getter checkpoint restore on every host${native.length ? `; native, for file edits: ${native.join(', ')}` : ''}.`);
  return lines.join('\n\n');
}

// Where `go-getter act` is the sole path to a real-world effect (decision 0180 item 5), per host and per worker kind; null while the guardrail's
// hook rule is not adopted. An agent worker on a host with a blocking pre-tool hook cannot reach a mapped effect tool another way; on any other host the
// verb is an instruction. A person acts for themselves, and a worker that is not a host agent is configured to call the verb: neither is blocked.
export function effectVerbCoverage(project, caps, hosts = HOSTS) {
  const adopted = collectEnforcement(project).some((e) => e.tier === 2 && e.parsed?.kind === 'builtin' && e.parsed.id === 'deny-effect-tools');
  if (!adopted) return null;
  const blocked = hosts.filter((h) => caps[h]?.hooks?.blockPreTool === true);
  const kinds = new Set(readWorkers(project).map((w) => w.kind));
  const listed = (k) => (kinds.size && !kinds.has(k) ? ' (none listed in the workers file)' : '');
  return [
    'Real-world effects (go-getter act): the verb is the sole path for',
    `agent workers on ${blocked.length ? blocked.join(', ') : 'no host'}${listed('agent')}; an instruction only on ${hosts.filter((h) => !blocked.includes(h)).join(', ') || 'no host'} (no blocking pre-tool hook);`,
    `human workers: not the sole path, a person may run the tool themselves${listed('human')};`,
    `ci workers: configured to call the verb, not blocked by a hook${listed('ci')}.`,
  ].join(' ');
}
