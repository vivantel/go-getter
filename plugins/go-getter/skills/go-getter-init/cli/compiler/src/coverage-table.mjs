// The README coverage table, generated from `coverage` rows (plan enforcement-hardening H9): a cell on a host whose adapter is
// deferred, or whose capability file lists the component under `unconfirmedTiers`, carries that mark so it never reads like a
// confirmed hook on Claude Code.
import { cellLabel } from './coverage.mjs';
import { deferredHosts } from './hosts/registry.mjs';

// The marks a (host, component) cell carries, from the registry and the capability file.
export function marksFor(host, component, caps, deferred = deferredHosts()) {
  const marks = [];
  if (deferred.includes(host)) marks.push('deferred');
  if ((caps[host]?.unconfirmedTiers ?? []).map(String).includes(String(component))) marks.push('unconfirmed');
  return marks;
}

export function labelWithMarks(row, host, caps, deferred) {
  const label = cellLabel(row, host);
  const marks = label === '-' ? [] : marksFor(host, row.component, caps, deferred);
  return marks.length ? `${label} (${marks.join(', ')})` : label;
}

const HOST_TITLES = { 'claude-code': 'Claude Code', codex: 'Codex', kilo: 'Kilo', opencode: 'OpenCode', cursor: 'Cursor', 'gemini-cli': 'Gemini CLI', copilot: 'Copilot' };

// The table as the lines the README holds.
export function coverageMarkdown(rows, hosts, caps, deferred) {
  const lines = [
    `| Component | Pack | ${hosts.map((h) => HOST_TITLES[h] ?? h).join(' | ')} |`,
    `|---|---|${hosts.map(() => '---').join('|')}|`,
  ];
  for (const r of rows) {
    const packs = r.packs.length ? r.packs.map((p) => `\`${p.split('@')[0]}\``).join(', ') : '—';
    lines.push(`| ${r.component} ${r.name} | ${packs} | ${hosts.map((h) => labelWithMarks(r, h, caps, deferred)).join(' | ')} |`);
  }
  return lines;
}
