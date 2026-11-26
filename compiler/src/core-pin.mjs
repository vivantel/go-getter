// The knowledge-base core is kms's artifact model, structural checker and conformance fixtures, vendored at a pinned kms ref
// (decisions 0211, 0212). src/core-pin.json records the ref, the schema version and a sha256 per vendored file; the copy is
// never edited here, only replaced by `go-getter core update`.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const PIN_FILE = 'src/core-pin.json';
const MODEL = 'plugins/kms/shared/artifact-model.md';
// kms path -> path in this repo. A directory entry ends in '/'.
export const CORE_MAP = {
  [MODEL]: 'src/shared/artifact-model.md',
  'plugins/kms/shared/lint_check.py': 'src/shared/lint_check.py',
  'plugins/kms/shared/migrate.py': 'src/shared/migrate.py',
  'evals/lint/conformance/cases/': 'compiler/test/kms-conformance/cases/',
  'evals/lint/conformance/test_conformance.py': 'compiler/test/kms-conformance/test_conformance.py',
  'evals/lint/frontmatter/cases/': 'compiler/test/kms-frontmatter/cases/',
  'evals/lint/lookup/': 'compiler/test/kms-lookup/',
};

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

export function schemaVersion(text) {
  const m = /^schema-version:\s*(\S+)/m.exec(text.split('\n')[0] ?? '');
  return m ? m[1] : null;
}

export function readPin(root) {
  const file = path.join(root, PIN_FILE);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

// Problems with the vendored copy: a missing or edited file, or a schema version that is not the pinned one.
export function pinProblems(root) {
  const pin = readPin(root);
  if (!pin) return [`${PIN_FILE} is missing (run "go-getter core update <ref> --from <kms checkout>")`];
  const out = [];
  for (const [file, want] of Object.entries(pin.files)) {
    const abs = path.join(root, file);
    if (!existsSync(abs)) out.push(`${file} is missing`);
    else if (sha256(readFileSync(abs)) !== want) out.push(`${file} differs from kms ${pin.ref} (vendored files are replaced by "go-getter core update", never edited)`);
  }
  const model = path.join(root, CORE_MAP[MODEL]);
  if (existsSync(model) && schemaVersion(readFileSync(model, 'utf8')) !== pin.schemaVersion) {
    out.push(`the vendored model's schema-version is not the pinned ${pin.schemaVersion}`);
  }
  return out;
}

const git = (dir, args) => execFileSync('git', ['-C', dir, ...args], { maxBuffer: 64 * 1024 * 1024 });

// Files of a kms ref as { kmsPath: Buffer } for every CORE_MAP entry.
export function readKmsRef(kmsDir, ref) {
  const files = {};
  for (const src of Object.keys(CORE_MAP)) {
    const paths = src.endsWith('/') ? git(kmsDir, ['ls-tree', '-r', '--name-only', ref, src]).toString().split('\n').filter(Boolean) : [src];
    for (const p of paths) files[p] = git(kmsDir, ['show', `${ref}:${p}`]);
  }
  return files;
}

// Replace the vendored copy with kms `ref` (any git ref) from a local kms checkout and rewrite the pin.
export function updateCore(root, kmsDir, ref) {
  const src = readKmsRef(kmsDir, ref);
  const sha = git(kmsDir, ['rev-parse', ref]).toString().trim();
  const mapped = (p) => {
    for (const [from, to] of Object.entries(CORE_MAP)) {
      if (from.endsWith('/') ? p.startsWith(from) : p === from) return to.endsWith('/') ? to + p.slice(from.length) : to;
    }
    throw new Error(`unmapped ${p}`);
  };
  for (const [from, to] of Object.entries(CORE_MAP)) if (to.endsWith('/')) rmSync(path.join(root, to), { recursive: true, force: true });
  const files = {};
  for (const [p, buf] of Object.entries(src)) {
    const dest = mapped(p);
    mkdirSync(path.dirname(path.join(root, dest)), { recursive: true });
    writeFileSync(path.join(root, dest), buf);
    files[dest] = sha256(buf);
  }
  const version = schemaVersion(src[MODEL].toString('utf8'));
  if (!version) throw new Error(`${MODEL} at ${ref} has no schema-version first line`);
  const pin = { source: 'kms', ref, commit: sha, schemaVersion: version, expectedTag: `kms-schema-${version.replace(/-.*$/, '')}`, files: Object.fromEntries(Object.entries(files).sort()) };
  writeFileSync(path.join(root, PIN_FILE), `${JSON.stringify(pin, null, 2)}\n`);
  return pin;
}

// Verify the recorded hashes against a kms checkout at the pinned ref (byte-identical to the source).
export function verifyAgainstKms(root, kmsDir) {
  const pin = readPin(root);
  const src = readKmsRef(kmsDir, pin.commit);
  const out = [];
  for (const [p, buf] of Object.entries(src)) {
    const dest = Object.entries(CORE_MAP).map(([f, t]) => (f.endsWith('/') ? (p.startsWith(f) ? t + p.slice(f.length) : null) : p === f ? t : null)).find(Boolean);
    if (pin.files[dest] !== sha256(buf)) out.push(`${dest} is not what kms ${pin.commit} has`);
  }
  return out;
}
