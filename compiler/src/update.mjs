// go-getter update (decision 0090): brings a project's generated output up to the installed package. Adopted packs are
// re-rendered with their recorded answers (new questions take their default, 0085), then the host outputs are applied
// from the manifest. The plan is made by running the update on a scratch copy of the project and diffing the two trees,
// so the printed plan is exactly what a real run writes.
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readArtifacts } from './artifacts.mjs';
import { applyPlan, bootstrap, planApply } from './apply.mjs';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
import { SCHEMA, readManifest, drift, driftLine } from './manifest.mjs';
import { loadPack } from './packs.mjs';
import { adoptedArtifacts, applyReconfigure, planReconfigure, currentAnswers } from './reconfigure.mjs';

const SKIP = new Set(['.git', 'node_modules']);

// Adopted pack ids with the version they were rendered at (`generated-by: <pack>@<version>` of active artifacts).
export function adoptedPackVersions(project) {
  const found = {};
  for (const a of readArtifacts(project)) {
    const m = ['active', 'draft'].includes(a.data.status) && /^([^@]+)@(.+)$/.exec(String(a.data['go-getter']?.['generated-by'] ?? ''));
    if (m) found[m[1]] = m[2];
  }
  return found;
}

// An artifact re-rendered unchanged keeps its date, so a second update is a no-op.
function keepDate(project, artifact) {
  const file = path.join(project, artifact.path);
  if (!existsSync(file)) return artifact;
  const old = parseFrontmatter(readFileSync(file, 'utf8')).data.date;
  const { data, body } = parseFrontmatter(artifact.content);
  return old === undefined ? artifact : { ...artifact, content: stringifyFrontmatter({ ...data, date: old }, body) };
}

function reRender(project, root, date, notes) {
  for (const id of Object.keys(adoptedPackVersions(project)).sort()) {
    const packFile = path.join(root, 'src/packs', id, 'pack.json');
    if (!existsSync(packFile)) {
      notes.push(`pack ${id}: not in this go-getter version; left as it is`);
      continue;
    }
    const pack = loadPack(packFile);
    const adopted = adoptedArtifacts(project, id);
    const acceptedBy = adopted.map((a) => a.data['accepted-by']).find(Boolean);
    const result = planReconfigure({ project, pack, answers: currentAnswers(adopted), acceptedBy, date, detect: {} });
    const artifacts = result.plan.artifacts.map((a) => keepDate(project, a));
    const differs = (rel, content) => !existsSync(path.join(project, rel)) || readFileSync(path.join(project, rel), 'utf8') !== content;
    result.plan = {
      ...result.plan,
      artifacts: artifacts.filter((a) => differs(a.path, a.content)),
      files: result.plan.files.filter((f) => differs(f.path, f.content)),
    };
    applyReconfigure({ project, result });
  }
}

// Runs the whole update on `project`; returns the files apply left as `modified`.
export function runUpdate(project, { root, date, force = false }) {
  const notes = [];
  const manifest = readManifest(project);
  if (manifest && manifest.schema > SCHEMA) {
    throw new Error(`the manifest has schema ${manifest.schema}, newer than this go-getter (${SCHEMA}); install a newer go-getter`);
  }
  if (!manifest) bootstrap(project);
  reRender(project, root, date, notes);
  const { modified } = applyPlan(project, planApply(project, { force }));
  return { modified, notes };
}

function tree(dir, rel = '') {
  const out = new Map();
  for (const name of readdirSync(path.join(dir, rel)).sort()) {
    if (!rel && SKIP.has(name)) continue;
    const r = rel ? `${rel}/${name}` : name;
    const stat = lstatSync(path.join(dir, r));
    if (stat.isDirectory()) for (const [k, v] of tree(dir, r)) out.set(k, v);
    else out.set(r, stat.isSymbolicLink() ? `-> ${readlinkSync(path.join(dir, r))}` : readFileSync(path.join(dir, r), 'utf8'));
  }
  return out;
}

// What an update would change, by running it on a scratch copy: { added, changed, removed, modified, notes, docs }.
export function planUpdate(project, opts) {
  const scratch = mkdtempSync(path.join(tmpdir(), 'gg-update-'));
  try {
    cpSync(project, scratch, { recursive: true, verbatimSymlinks: true, filter: (src) => path.basename(src) !== 'node_modules' });
    // A worktree's `.git` is a file pointing at the shared repository: give the copy its own, so git settings stay in the copy.
    const gitFile = path.join(scratch, '.git');
    if (existsSync(gitFile) && lstatSync(gitFile).isFile()) {
      const hooksPath = readHooksPath(project);
      rmSync(gitFile);
      execFileSync('git', ['init', '-q'], { cwd: scratch });
      if (hooksPath) execFileSync('git', ['config', 'core.hooksPath', hooksPath], { cwd: scratch });
    }
    const before = tree(project);
    const { modified, notes } = runUpdate(scratch, opts);
    const after = tree(scratch);
    const added = [...after.keys()].filter((k) => !before.has(k));
    const removed = [...before.keys()].filter((k) => !after.has(k));
    const changed = [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k));
    return { added, changed, removed, modified, notes, git: readHooksPath(scratch) !== readHooksPath(project) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function readHooksPath(dir) {
  try {
    return execFileSync('git', ['config', '--get', 'core.hooksPath'], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export const isDocs = (p) => p.startsWith('docs/');

export function writePlanSummary(plan, log = console.log) {
  const groups = [
    ['docs re-rendered', [...plan.added, ...plan.changed].filter(isDocs)],
    ['docs removed', plan.removed.filter(isDocs)],
    ['files added', plan.added.filter((p) => !isDocs(p))],
    ['files changed', plan.changed.filter((p) => !isDocs(p))],
    ['files removed', plan.removed.filter((p) => !isDocs(p))],
  ];
  let any = false;
  for (const [label, list] of groups) {
    if (!list.length) continue;
    any = true;
    log(`  ${label}:`);
    for (const p of list) log(`    ${p}`);
  }
  if (plan.git) {
    any = true;
    log('  git config core.hooksPath changes');
  }
  if (!any) log('  nothing to change');
  for (const n of plan.notes) log(`  note: ${n}`);
  return any;
}

// The installed package: its version and the version of every pack it ships.
export function installedPackage(root) {
  let version;
  try {
    version = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  } catch {
    // unversioned checkout
  }
  const packs = {};
  const dir = path.join(root, 'src/packs');
  if (existsSync(dir)) for (const id of readdirSync(dir)) if (existsSync(path.join(dir, id, 'pack.json'))) packs[id] = loadPack(path.join(dir, id, 'pack.json')).version;
  return { version, packs };
}

// The session-start nudge: one line when the project's manifest is older than the installed package, else nothing.
export function driftNudge(project, root) {
  const manifest = readManifest(project);
  const installed = installedPackage(root);
  return driftLine(drift(manifest, installed), installed.version, manifest);
}
