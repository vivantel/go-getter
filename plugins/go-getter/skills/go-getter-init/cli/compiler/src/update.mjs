// go-getter update (decision 0090): brings a project's generated output up to the installed package. Adopted packs are
// re-rendered with their recorded answers (new questions take their default, 0085), then the host outputs are applied
// from the manifest. The plan is made by running the update on a scratch copy of the project and diffing the two trees,
// so the printed plan is exactly what a real run writes.
import { cpSync, existsSync, lstatSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { applyPlan, bootstrap, planApply } from './apply.mjs';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
import { SCHEMA, adoptedPacks, readManifest } from './manifest.mjs';
import { gitSetting } from './reconcile.mjs';
import { loadPack } from './packs.mjs';
import { adoptedArtifacts, applyReconfigure, planReconfigure, currentAnswers } from './reconfigure.mjs';

const skipped = (name) => name === '.git' || name === 'node_modules';

// An artifact re-rendered unchanged keeps its date, so a second update is a no-op.
function keepDate(project, artifact) {
  const file = path.join(project, artifact.path);
  if (!existsSync(file)) return artifact;
  const old = parseFrontmatter(readFileSync(file, 'utf8')).data.date;
  const { data, body } = parseFrontmatter(artifact.content);
  return old === undefined ? artifact : { ...artifact, content: stringifyFrontmatter({ ...data, date: old }, body) };
}

function reRender(project, root, date, notes) {
  for (const id of Object.keys(adoptedPacks(project))) {
    const packFile = path.join(root, 'src/packs', id, 'pack.json');
    if (!existsSync(packFile)) {
      notes.push(`pack ${id}: not in this go-getter version; left as it is`);
      continue;
    }
    const pack = loadPack(packFile);
    const adopted = adoptedArtifacts(project, id);
    // Decisions an update adds are proposals (decision 0091): rendered as draft, for the owner to accept.
    const result = planReconfigure({ project, pack, answers: currentAnswers(adopted), date, detect: {}, draft: true });
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

// Path to content hash (or link target) for every file under `dir`, skipping `.git` at the top and `node_modules` anywhere.
function tree(dir, rel = '') {
  const out = new Map();
  for (const name of readdirSync(path.join(dir, rel)).sort()) {
    if (name === 'node_modules' || (!rel && name === '.git')) continue;
    const r = rel ? `${rel}/${name}` : name;
    const stat = lstatSync(path.join(dir, r));
    if (stat.isDirectory()) for (const [k, v] of tree(dir, r)) out.set(k, v);
    else out.set(r, stat.isSymbolicLink() ? `-> ${readlinkSync(path.join(dir, r))}` : createHash('sha256').update(readFileSync(path.join(dir, r))).digest('hex'));
  }
  return out;
}

const gitOut = (cwd, ...args) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

// The copy has no history: it gets the settings detection and apply read (current branch, origin and its HEAD,
// core.hooksPath), so its plan matches the real one, and its own git directory, so nothing reaches the real repository.
function copyGitState(project, scratch) {
  if (!existsSync(path.join(project, '.git'))) return;
  const branch = gitOut(project, 'branch', '--show-current') || 'main';
  const remote = gitOut(project, 'remote', 'get-url', 'origin');
  const originHead = gitOut(project, 'symbolic-ref', 'refs/remotes/origin/HEAD');
  const hooksPath = gitSetting(project, 'core.hooksPath');
  execFileSync('git', ['init', '-q', '-b', branch], { cwd: scratch });
  if (remote) execFileSync('git', ['remote', 'add', 'origin', remote], { cwd: scratch });
  if (originHead) execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', originHead], { cwd: scratch });
  if (hooksPath !== undefined) execFileSync('git', ['config', 'core.hooksPath', hooksPath], { cwd: scratch });
}

// What an update would change, by running it on a scratch copy: { added, changed, removed, modified, notes, docs }.
export function planUpdate(project, opts) {
  const scratch = mkdtempSync(path.join(tmpdir(), 'gg-update-'));
  try {
    cpSync(project, scratch, { recursive: true, verbatimSymlinks: true, filter: (src) => src === project || !skipped(path.basename(src)) });
    copyGitState(project, scratch);
    const before = tree(project);
    const { modified, notes } = runUpdate(scratch, opts);
    const after = tree(scratch);
    const added = [...after.keys()].filter((k) => !before.has(k));
    const removed = [...before.keys()].filter((k) => !after.has(k));
    const changed = [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k));
    return { added, changed, removed, modified, notes, git: gitSetting(scratch, 'core.hooksPath') !== gitSetting(project, 'core.hooksPath') };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
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
