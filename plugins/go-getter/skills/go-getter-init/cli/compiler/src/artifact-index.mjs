// Decision 0167 item 4: INDEX.md files are generated from frontmatter, and a new fact or decision takes a unit-scoped
// draft id (`draft-<unit>-<slug>`) that `assign` turns into the next free `NNNN` and rewrites references to.
import { readFileSync, readdirSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { cleanGitEnv } from './git-env.mjs';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';

export const INDEXED_TYPES = ['facts', 'decisions', 'guardrails', 'skills'];
const HEADER = { facts: 'Facts', decisions: 'Decisions', guardrails: 'Guardrails', skills: 'Skills' };
const NUMBERED = ['facts', 'decisions'];
const DRAFT_ID = /^draft-[a-z0-9]+(?:-[a-z0-9]+)*$/;

const csv = (s) => `"${String(s).replace(/"/g, '""')}"`;
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function entries(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md') && n !== 'INDEX.md')
    .map((n) => {
      const { data } = parseFrontmatter(readFileSync(path.join(dir, n), 'utf8'));
      return { id: n.slice(0, -3), data };
    })
    .sort(byId);
}

export function renderIndex(type, rows, archive = false) {
  const lines = rows.map(({ id, data }) => {
    const tags = Array.isArray(data.tags) ? data.tags.join(', ') : (data.tags ?? '');
    return `${id},${csv(data.title ?? '')},${csv(tags)},${data.status ?? ''}`;
  });
  return `# ${HEADER[type]}${archive ? ' archive' : ''} index (CSV)\n\nid,title,tags,status\n${lines.length ? `${lines.join('\n')}\n` : ''}`;
}

// The index files of a project: live directories and their archive/ directories.
export function expectedIndexes(root) {
  const out = {};
  for (const type of INDEXED_TYPES) {
    const dir = path.join(root, 'docs', type);
    if (!existsSync(dir)) continue;
    const archive = path.join(dir, 'archive');
    out[`docs/${type}/INDEX.md`] = renderIndex(type, entries(dir));
    if (existsSync(archive)) out[`docs/${type}/archive/INDEX.md`] = renderIndex(type, entries(archive), true);
  }
  return out;
}

export function writeIndexes(root) {
  const written = [];
  for (const [rel, content] of Object.entries(expectedIndexes(root))) {
    const file = path.join(root, rel);
    if (existsSync(file) && readFileSync(file, 'utf8') === content) continue;
    writeFileSync(file, content);
    written.push(rel);
  }
  return written;
}

// Problems: an index that differs from its generation, and a number two facts or two decisions share.
export function indexProblems(root) {
  const problems = [];
  for (const [rel, content] of Object.entries(expectedIndexes(root))) {
    const file = path.join(root, rel);
    if (!existsSync(file)) problems.push(`${rel}: missing; run "go-getter artifacts index"`);
    else if (readFileSync(file, 'utf8') !== content) problems.push(`${rel}: differs from its generation from frontmatter; run "go-getter artifacts index" and never hand-edit it`);
  }
  for (const type of NUMBERED) {
    const seen = new Map();
    for (const dir of [path.join(root, 'docs', type), path.join(root, 'docs', type, 'archive')]) {
      for (const { id } of entries(dir)) {
        const n = /^(\d{4})-/.exec(id)?.[1];
        if (!n) continue;
        if (seen.has(n)) problems.push(`docs/${type}: number ${n} is used by ${seen.get(n)} and ${id}`);
        else seen.set(n, id);
      }
    }
  }
  return problems;
}

export const isDraftId = (id) => DRAFT_ID.test(id);

// Gives each `draft-<unit>-<slug>` fact or decision the next number (highest `NNNN` in the directory, archive included,
// plus one; `floor` is a higher number seen on the default branch). Drafts are taken in id order, so the result is
// deterministic. Renames the file, sets its `id`, rewrites references to the old id in every .md file under docs/, src/
// and the root, and regenerates the indexes. Returns [{ type, from, to }].
export function assignIds(root, { floor = {} } = {}) {
  const assigned = [];
  for (const type of NUMBERED) {
    const dir = path.join(root, 'docs', type);
    const all = [...entries(dir), ...entries(path.join(dir, 'archive'))];
    let next = Math.max(0, floor[type] ?? 0, ...all.map((e) => Number(/^(\d{4})-/.exec(e.id)?.[1] ?? 0))) + 1;
    for (const e of entries(dir).filter((x) => isDraftId(x.id))) {
      const to = `${String(next++).padStart(4, '0')}-${e.id.replace(/^draft-[a-z0-9]+-/, '')}`;
      const from = path.join(dir, `${e.id}.md`);
      const { data, body } = parseFrontmatter(readFileSync(from, 'utf8'));
      writeFileSync(from, stringifyFrontmatter({ ...data, id: to }, body));
      renameSync(from, path.join(dir, `${to}.md`));
      assigned.push({ type, from: e.id, to });
    }
  }
  if (assigned.length) {
    rewriteReferences(root, assigned);
    writeIndexes(root);
  }
  return assigned;
}

function markdownFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) markdownFiles(p, out);
    else if (e.name.endsWith('.md') && e.name !== 'INDEX.md') out.push(p);
  }
  return out;
}

function rewriteReferences(root, assigned) {
  const files = [...markdownFiles(path.join(root, 'docs')), ...markdownFiles(path.join(root, 'src'))];
  for (const e of readdirSync(root)) if (e.endsWith('.md')) files.push(path.join(root, e));
  // longest id first so a draft id that is a prefix of another is not rewritten inside it
  const order = [...assigned].sort((a, b) => b.from.length - a.from.length);
  for (const file of new Set(files)) {
    const text = readFileSync(file, 'utf8');
    let out = text;
    for (const { from, to } of order) out = out.replace(new RegExp(`(?<![A-Za-z0-9-])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9-])`, 'g'), to);
    if (out !== text) writeFileSync(file, out);
  }
}

// The highest `NNNN` per numbered type on a git ref (the default branch), so a number taken there is never reused.
export function numberFloor(root, ref) {
  const floor = {};
  for (const type of NUMBERED) {
    const out = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, '--', `docs/${type}/`], { cwd: root, encoding: 'utf8', env: cleanGitEnv(process.env) });
    floor[type] = Math.max(0, ...out.split('\n').map((l) => Number(/\/(\d{4})-[^/]*\.md$/.exec(l)?.[1] ?? 0)));
  }
  return floor;
}
