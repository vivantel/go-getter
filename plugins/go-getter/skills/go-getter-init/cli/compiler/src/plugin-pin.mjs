// The plugin this repo runs on (decision 0160): the version the host installed for a project, and the pin in project settings.
import path from 'node:path';
import os from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;
export const parseVersion = (v) => {
  const m = SEMVER.exec(String(v ?? ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
export const compareVersions = (a, b) => {
  const x = parseVersion(a);
  const y = parseVersion(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
};

const readJson = (file) => {
  try {
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  } catch {
    return null;
  }
};

// The version Claude Code installed for `project` (a project-scope entry wins over a user-scope one), or null.
export function installedPluginVersion(project, name = 'go-getter@go-getter', home = os.homedir()) {
  const entries = readJson(path.join(home, '.claude', 'plugins', 'installed_plugins.json'))?.plugins?.[name];
  if (!Array.isArray(entries)) return null;
  const root = path.resolve(project);
  const mine = entries.filter((e) => typeof e?.version === 'string' && (e.scope !== 'project' || e.projectPath === root));
  return (mine.find((e) => e.scope === 'project') ?? mine[0])?.version ?? null;
}

// The ref the project settings pin the marketplace to, or null when there is no pin.
export function pinnedRef(project, marketplace = 'go-getter') {
  const ref = readJson(path.join(project, '.claude', 'settings.json'))?.extraKnownMarketplaces?.[marketplace]?.source?.ref;
  return typeof ref === 'string' ? ref : null;
}

// The highest release tag (vX.Y.Z) of the repository, or null when there is none.
export function latestTag(project, exec = (args) => execFileSync('git', ['-C', project, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) {
  try {
    return exec(['tag', '--list', 'v*']).split('\n').map((t) => t.trim()).filter((t) => parseVersion(t)).sort(compareVersions).pop() ?? null;
  } catch {
    return null;
  }
}
