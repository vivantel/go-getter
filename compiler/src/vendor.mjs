// Vendored kms (decision 0006): fetch upstream plugins/kms at a pinned ref into vendor/kms/.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, cpSync, existsSync, readFileSync, writeFileSync, readdirSync, statSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const LOCK_FILE = 'vendor/kms.lock.json';
export const VENDOR_DIR = 'vendor/kms';
export const DEFAULT_REPO = 'https://github.com/vivantel/kms';
const UPSTREAM_PATH = 'plugins/kms';

const git = (args, cwd) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function readLock(root) {
  const file = path.join(root, LOCK_FILE);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

// Clones `repo` at `ref` and returns { dir, sha, cleanup } with dir = the upstream plugin directory.
export function fetchUpstream(repo, ref) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'go-getter-kms-'));
  try {
    git(['clone', '--quiet', '--depth', '1', '--branch', ref, repo, tmp]);
    const sha = git(['rev-parse', 'HEAD'], tmp);
    const dir = path.join(tmp, UPSTREAM_PATH);
    if (!existsSync(dir)) throw new Error(`${repo}@${ref} has no ${UPSTREAM_PATH}/`);
    return { dir, sha, licenseFile: path.join(tmp, 'LICENSE'), cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    throw err;
  }
}

export function syncKms(root, { repo = DEFAULT_REPO, ref, excludeSkills } = {}) {
  if (!ref) throw new Error('sync:kms needs a ref (a release tag), e.g. npm run sync:kms -- 0.15.0');
  const previous = readLock(root);
  const upstream = fetchUpstream(repo, ref);
  try {
    const dest = path.join(root, VENDOR_DIR);
    rmSync(dest, { recursive: true, force: true });
    cpSync(upstream.dir, dest, { recursive: true });
    if (existsSync(upstream.licenseFile)) cpSync(upstream.licenseFile, path.join(dest, 'LICENSE'));
    const lock = {
      repo,
      ref,
      sha: upstream.sha,
      path: UPSTREAM_PATH,
      excludeSkills: excludeSkills ?? previous?.excludeSkills ?? [],
    };
    writeFileSync(path.join(root, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`);
    return lock;
  } finally {
    upstream.cleanup();
  }
}

function tree(dir, base = dir) {
  const out = {};
  for (const name of readdirSync(dir).sort()) {
    const p = path.join(dir, name);
    const rel = path.relative(base, p);
    if (lstatSync(p).isSymbolicLink()) out[rel] = 'symlink';
    else if (statSync(p).isDirectory()) Object.assign(out, tree(p, base));
    else out[rel] = readFileSync(p).toString('base64');
  }
  return out;
}

// Compares vendor/kms with upstream at the locked ref; returns a list of problems.
export function diffVendor(root) {
  const lock = readLock(root);
  if (!lock) return existsSync(path.join(root, VENDOR_DIR)) ? [`${VENDOR_DIR} exists without ${LOCK_FILE}`] : [];
  const upstream = fetchUpstream(lock.repo, lock.ref);
  try {
    const problems = [];
    if (upstream.sha !== lock.sha) problems.push(`ref ${lock.ref} now resolves to ${upstream.sha}, lock says ${lock.sha}`);
    const expected = tree(upstream.dir);
    if (existsSync(upstream.licenseFile)) expected.LICENSE = readFileSync(upstream.licenseFile).toString('base64');
    const actual = existsSync(path.join(root, VENDOR_DIR)) ? tree(path.join(root, VENDOR_DIR)) : {};
    for (const f of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      if (!(f in actual)) problems.push(`missing: ${VENDOR_DIR}/${f}`);
      else if (!(f in expected)) problems.push(`not upstream: ${VENDOR_DIR}/${f}`);
      else if (actual[f] !== expected[f]) problems.push(`edited: ${VENDOR_DIR}/${f}`);
    }
    return problems.sort();
  } finally {
    upstream.cleanup();
  }
}
