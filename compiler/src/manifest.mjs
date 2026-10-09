// The committed ownership record of `go-getter apply` (decision 0089, fact 0033): `.go-getter/manifest.json` lists
// every whole file apply owns (with a content hash) and, for shared files, the keys, array items or marked block it
// owns with the value each replaced, so update and remove can tell go-getter's content from the user's.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readArtifacts } from './artifacts.mjs';
import { lstatSync, readlinkSync } from 'node:fs';
import { same, at, blockOf, hashContent } from './reconcile.mjs';

export const MANIFEST = '.go-getter/manifest.json';
export const SCHEMA = 1;

export { hashContent };

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const byPath = (a, b) => (a.path.join('.') < b.path.join('.') ? -1 : 1);

export function readManifest(project) {
  const file = path.join(project, MANIFEST);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

// Owned parts of a shared JSON file: object keys whose leaf value changed (`key`, with the value it replaced; no
// `replaced` when the key was new) and array items added (`items`), found by walking the project's file against the planned one.
export function jsonOwnership(before, after, trail = []) {
  const owned = [];
  for (const k of Object.keys(after)) {
    const here = [...trail, k];
    const was = before?.[k];
    if (isObject(after[k]) && (was === undefined || isObject(was))) owned.push(...jsonOwnership(was ?? {}, after[k], here));
    else if (Array.isArray(after[k]) && (was === undefined || Array.isArray(was))) {
      const items = after[k].filter((x) => !(was ?? []).some((y) => same(x, y)));
      if (items.length) owned.push({ kind: 'items', path: here, items });
    } else if (!same(was, after[k])) {
      owned.push(was === undefined ? { kind: 'key', path: here, value: after[k] } : { kind: 'key', path: here, value: after[k], replaced: was });
    }
  }
  return owned;
}

// Adopted packs and their versions, from the `generated-by: <pack>@<version>` of active artifacts.
function adoptedPacks(project) {
  const found = {};
  for (const a of readArtifacts(project)) {
    if (!['active', 'draft'].includes(a.data.status)) continue;
    const m = /^([^@]+)@(.+)$/.exec(String(a.data['go-getter']?.['generated-by'] ?? ''));
    if (m) found[m[1]] = m[2];
  }
  return Object.fromEntries(Object.entries(found).sort());
}

// The manifest for a planned apply. `previous` carries over what is already recorded: once an apply has written, the
// project's files hold go-getter's values, so the values they replaced can no longer be read from them.
export function buildManifest(plan, previous = null) {
  const files = {};
  const shared = {};
  const old = previous?.shared ?? {};
  for (const [rel, o] of Object.entries(plan.outputs).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!plan.shared.has(rel)) {
      files[rel] = 'symlink' in o ? { symlink: o.symlink } : { hash: hashContent(o.content), ...(o.mode ? { mode: o.mode.toString(8) } : {}) };
    } else if (rel === 'AGENTS.md') {
      // The block was appended unless the file already carried the markers (then the previous record says which).
      const carried = plan.before[rel]?.includes(plan.markers[0]);
      const appended = carried ? old[rel]?.[0]?.appended === true : true;
      const created = carried ? old[rel]?.[0]?.created === true : plan.before[rel] === null;
      shared[rel] = plan.blockHeld ? old[rel] : [{ kind: 'block', hash: hashContent(plan.block), ...(appended ? { appended } : {}), ...(created ? { created } : {}) }];
    } else {
      // `before` is the file with the previously owned parts undone, so these are the parts owned now, plus edited ones kept.
      const fresh = jsonOwnership(plan.before[rel] ? JSON.parse(plan.before[rel]) : {}, JSON.parse(o.content)).filter((i) => !(plan.held[rel] ?? []).some((h) => same(h.path, i.path)));
      // Items recorded without the value they replaced stay in place on undo, so they are carried while still set.
      const unknown = (old[rel] ?? []).filter((i) => i.unknown && same(at(JSON.parse(o.content), i.path), i.kind === 'items' ? undefined : i.value) && !fresh.some((f) => same(f.path, i.path)));
      shared[rel] = [...fresh, ...unknown, ...(plan.held[rel] ?? [])].sort(byPath);
    }
  }
  // Files left alone as edited stay owned, so the next run reports them again.
  for (const [rel, rec] of Object.entries(plan.skipped ?? {})) files[rel] = rec;
  const git = plan.gitConfig;
  if (git) {
    const replaced = old['git-config']?.[0]?.replaced ?? (git.replaced !== git.value ? git.replaced : undefined);
    shared['git-config'] = [{ kind: 'git-config', setting: git.setting, value: git.value, ...(replaced === undefined ? {} : { replaced }) }];
  } else if (plan.gitHeld) shared['git-config'] = old['git-config'];
  return { schema: SCHEMA, version: plan.version ?? null, packs: adoptedPacks(plan.project), files, shared: Object.fromEntries(Object.entries(shared).filter(([, v]) => v?.length)) };
}

export const manifestText = (manifest) => `${JSON.stringify(manifest, null, 2)}\n`;

// The manifest of a project adopted before manifests existed, from a plan made with `bootstrap: true` (outputs
// computed on empty settings, so the wanted keys and items are known apart from the user's). Only what the project
// already holds is recorded. Whole files are recorded with the hash go-getter would write, so one that differs counts as
// `modified` the first time it is compared; what a key replaced is unknown, so it is left in place on undo.
export function bootstrapManifest(project, plan) {
  const files = {};
  const shared = {};
  const present = (rel) => {
    try {
      return lstatSync(path.join(project, rel));
    } catch {
      return null;
    }
  };
  for (const [rel, o] of Object.entries(plan.outputs).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const stat = present(rel);
    if (!stat) continue;
    if (!plan.shared.has(rel)) {
      if ('symlink' in o) {
        if (stat.isSymbolicLink() && readlinkSync(path.join(project, rel)) === o.symlink) files[rel] = { symlink: o.symlink };
      } else files[rel] = { hash: hashContent(o.content), ...(o.mode ? { mode: o.mode.toString(8) } : {}) };
    } else if (rel === 'AGENTS.md') {
      if (blockOf(readFileSync(path.join(project, rel), 'utf8'), plan.markers)) shared[rel] = [{ kind: 'block', hash: hashContent(plan.block) }];
    } else {
      const current = JSON.parse(readFileSync(path.join(project, rel), 'utf8'));
      const items = [];
      for (const w of jsonOwnership({}, JSON.parse(o.content))) {
        const now = at(current, w.path);
        if (w.kind === 'items') {
          const have = w.items.filter((x) => Array.isArray(now) && now.some((y) => same(x, y)));
          if (have.length) items.push({ ...w, items: have });
        } else if (now !== undefined) items.push({ kind: 'key', path: w.path, value: w.value, unknown: true });
      }
      if (items.length) shared[rel] = items.sort(byPath);
    }
  }
  const git = plan.gitConfig;
  if (git && git.replaced === git.value) shared['git-config'] = [{ kind: 'git-config', setting: git.setting, value: git.value, unknown: true }];
  return { schema: SCHEMA, version: plan.version ?? null, packs: adoptedPacks(plan.project), files, shared };
}

const parts = (v) => String(v).split('-')[0].split('.').map((n) => Number.parseInt(n, 10) || 0);
export function olderThan(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
  return false;
}

// What in the manifest is older than the installed package: { version, packs } or null when current or no manifest.
// `installed` is { version, packs: { id: version } }.
export function drift(manifest, installed) {
  if (!manifest) return null;
  const older = manifest.version && installed.version && olderThan(manifest.version, installed.version) ? manifest.version : null;
  const packs = Object.entries(manifest.packs ?? {}).filter(([id, v]) => installed.packs[id] && olderThan(v, installed.packs[id])).map(([id]) => id);
  return older || packs.length ? { version: older, packs } : null;
}

export function driftLine(d, installedVersion, manifest) {
  if (!d) return '';
  const what = d.version ? `project at ${manifest.version}` : `pack${d.packs.length > 1 ? 's' : ''} ${d.packs.join(', ')} older than installed`;
  return `go-getter ${installedVersion} installed, ${what}: run go-getter update`;
}
