// What `go-getter doctor` verifies about enforcement itself (plan enforcement-hardening H3): each problem names its fix.
// A hook that cannot run lets every call through, so each of these is a way enforcement is silently off.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { planApply, diffApply, packageVersion, RUNNER, VENDORED_CLI } from './apply.mjs';
import { readManifest } from './manifest.mjs';
import { hostOp } from './hosts/registry.mjs';
import { installedPluginVersion } from './plugin-pin.mjs';

// The floor is package.json's engines.node (guardrail node-floor-is-oldest-supported-lts), never a second hard-coded number.
const nodeFloor = (root) => Number(/(\d+)/.exec(JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).engines.node)[1]);

export function enforcementProblems(project, { root, hosts, nodeVersion = process.versions.node, home } = {}) {
  const problems = [];
  const NODE_FLOOR = nodeFloor(root);
  const add = (what, fix) => problems.push({ what, fix });
  if (Number(nodeVersion.split('.')[0]) < NODE_FLOOR) add(`Node ${nodeVersion} is below ${NODE_FLOOR}; the hooks cannot run and enforcement is OFF`, `install Node ${NODE_FLOOR} or newer`);
  const cli = packageVersion(root);
  const plugin = installedPluginVersion(project, undefined, home);
  if (plugin && plugin !== cli) add(`the installed go-getter plugin is ${plugin} but the CLI is ${cli}; the skills run older instructions`, 'claude plugin update go-getter@go-getter, then restart the host');
  // A project that never ran apply has no enforcement to be missing.
  if (!readManifest(project)) return problems;
  const plan = planApply(project, { hosts });
  if (plan.tier2) {
    const vendored = Object.keys(plan.outputs).some((rel) => rel.startsWith(`${VENDORED_CLI}/`));
    if (!existsSync(path.join(project, RUNNER))) add(`${RUNNER} is missing; every hook skips and enforcement is OFF`, 'go-getter apply');
    else if (vendored && !existsSync(path.join(project, VENDORED_CLI))) add(`${VENDORED_CLI} is missing (it is gitignored, so a fresh clone has none); every hook skips and enforcement is OFF`, 'go-getter apply');
    for (const host of plan.hosts) {
      const file = hostOp(host, 'describe').hookFile;
      if (!file) continue;
      const text = existsSync(path.join(project, file)) ? readFileSync(path.join(project, file), 'utf8') : '';
      if (!text.includes(`${RUNNER}`) || !/hook pre-tool/.test(text)) add(`${host}: no go-getter pre-tool hook in ${file}; enforcement is OFF for that host`, 'go-getter apply');
    }
  }
  const drift = diffApply(project, plan);
  if (drift.length) add(`${drift.length} generated file(s) out of date: ${drift.slice(0, 5).join('; ')}${drift.length > 5 ? '; ...' : ''}`, 'go-getter apply');
  return problems;
}
