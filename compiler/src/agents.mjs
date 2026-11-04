// Agent definitions (plan 5.2, decision 0014): the roster decision's `go-getter.roles` compiled to each host's native agent format.
// Role data lives in adopted orchestration decisions (decision 0007); this module only renders it.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readArtifacts } from './artifacts.mjs';
import { loadCapabilities } from './capabilities.mjs';
import { compiledDefault } from './routing/policy.mjs';
import { AGENT_MARKER, roleBody } from './hosts/agent-format.mjs';
import { hostOp } from './hosts/registry.mjs';

export { AGENT_MARKER, roleBody };

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// The adopted orchestration data: roles with access overrides and the shared contract text.
export function readRoster(project) {
  const decisions = readArtifacts(project, ['decisions']).filter((d) => d.data.status === 'active' && String(d.data['go-getter']?.['generated-by'] ?? '').startsWith('orchestration@'));
  const roster = decisions.find((d) => d.data['go-getter'].roles);
  if (!roster) return null;
  const merged = (key) => Object.assign({}, ...decisions.map((d) => d.data['go-getter'][key] ?? {}));
  const text = (key) => decisions.map((d) => d.data['go-getter'][key]).find(Boolean) ?? null;
  const access = merged('role-access');
  const notes = merged('role-notes');
  return {
    decision: roster.id,
    roles: roster.data['go-getter'].roles.map((r) => ({ ...r, access: access[r.id] ?? r.access, note: notes[r.id] ?? null })),
    handoff: text('handoff'),
    escalation: text('escalation'),
  };
}

// {path: {content}} for every role on every host that has native agents.
export function agentOutputs(project, hosts, caps = loadCapabilities(PACKAGE_ROOT)) {
  const roster = readRoster(project);
  const out = {};
  if (!roster) return out;
  for (const host of hosts) {
    const agents = caps[host]?.agents;
    if (!agents) continue;
    for (const role of roster.roles) {
      const route = agents.model ? compiledDefault(project, host, role, { effortControl: agents.effort }) : null;
      const file = hostOp(host, 'agent', { roster, role, route, capabilities: { agents } });
      if (file.missing) continue;
      out[`${agents.dir}/${role.id}${agents.extension}`] = { content: file.content };
    }
  }
  return out;
}

// Generated agent files in `hosts`' agent dirs that the current roster no longer produces.
export function staleAgentFiles(project, hosts, planned, caps = loadCapabilities(PACKAGE_ROOT)) {
  const stale = [];
  for (const host of hosts) {
    const agents = caps[host]?.agents;
    const dir = agents && path.join(project, agents.dir);
    if (!dir || !existsSync(dir)) continue;
    for (const name of readdirSync(dir).sort()) {
      const rel = `${agents.dir}/${name}`;
      if (name.endsWith(agents.extension) && !(rel in planned) && readFileSync(path.join(dir, name), 'utf8').includes(AGENT_MARKER)) stale.push(rel);
    }
  }
  return stale;
}
