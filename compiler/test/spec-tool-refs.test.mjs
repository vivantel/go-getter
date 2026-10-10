import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { suggestRefs } from '../src/refs.mjs';
import { cleanGitEnv } from '../src/git-env.mjs';

const env = cleanGitEnv(process.env);
const git = (cwd, ...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const today = '2026-10-10';

const FILES = {
  'docs/skills/tags.md': '---\nid: tags\ntitle: Tags\nstatus: active\ndate: 2026-10-01\ntags: [shared]\n---\n\nalpha — a\n',
  'openspec/config.yaml': 'schema: spec-driven\n',
  'openspec/specs/a/spec.md': '# a\n',
  'openspec/changes/add-x/proposal.md': '# add x\n',
  'openspec/changes/add-x/tasks.md': '- [ ] one\n',
  'openspec/changes/add-y/proposal.md': '# add y\n',
  'src/app.mjs': 'export {};\n',
};

function fixture(branch = 'feat/other') {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-spec-refs-'));
  for (const [rel, content] of Object.entries(FILES)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init');
  git(dir, 'checkout', '-q', '-b', branch);
  return dir;
}
const rows = (refs) => ({ must: refs.must.map((r) => `${r.path} — ${r.reason}`), nice: refs.nice.map((r) => `${r.path} — ${r.reason}`) });
const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });

test('a touched change folder is a must-have, once, however many of its files changed', () => {
  const dir = fixture();
  try {
    appendFileSync(path.join(dir, 'openspec/changes/add-x/tasks.md'), '- [ ] two\n');
    appendFileSync(path.join(dir, 'openspec/changes/add-x/proposal.md'), 'more\n');
    git(dir, 'add', '-A');
    assert.deepEqual(rows(suggestRefs(dir, { staged: true, today })), { must: ['openspec/changes/add-x — change folder touched in this diff'], nice: [] });
  } finally {
    cleanup(dir);
  }
});

test('an archived change is listed by its archive path, not by the deleted live folder', () => {
  const dir = fixture();
  try {
    mkdirSync(path.join(dir, 'openspec/changes/archive'), { recursive: true });
    git(dir, 'mv', 'openspec/changes/add-x', 'openspec/changes/archive/2026-10-10-add-x');
    assert.deepEqual(rows(suggestRefs(dir, { staged: true, today })).must, ['openspec/changes/archive/2026-10-10-add-x — change folder touched in this diff']);
  } finally {
    cleanup(dir);
  }
});

test('a branch slug matching an untouched change is only nice-to-have', () => {
  const dir = fixture('feat/add-y');
  try {
    appendFileSync(path.join(dir, 'src/app.mjs'), '// edit\n');
    git(dir, 'add', '-A');
    assert.deepEqual(rows(suggestRefs(dir, { staged: true, today })), { must: [], nice: ['openspec/changes/add-y — branch slug matches this change'] });
  } finally {
    cleanup(dir);
  }
});

test('a branch slug matching a touched change is not listed twice', () => {
  const dir = fixture('feat/add-y');
  try {
    appendFileSync(path.join(dir, 'openspec/changes/add-y/proposal.md'), 'more\n');
    git(dir, 'add', '-A');
    assert.deepEqual(rows(suggestRefs(dir, { staged: true, today })), { must: ['openspec/changes/add-y — change folder touched in this diff'], nice: [] });
  } finally {
    cleanup(dir);
  }
});

test('edits outside change folders, such as the living specs, add nothing', () => {
  const dir = fixture();
  try {
    appendFileSync(path.join(dir, 'openspec/specs/a/spec.md'), 'more\n');
    git(dir, 'add', '-A');
    assert.deepEqual(rows(suggestRefs(dir, { staged: true, today })), { must: [], nice: [] });
  } finally {
    cleanup(dir);
  }
});

test('a repository without the tool is unchanged', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-spec-refs-none-'));
  try {
    mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
    writeFileSync(path.join(dir, 'docs/skills/tags.md'), FILES['docs/skills/tags.md']);
    writeFileSync(path.join(dir, 'a.txt'), 'a\n');
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'add', '-A');
    git(dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '-m', 'init');
    appendFileSync(path.join(dir, 'a.txt'), 'b\n');
    git(dir, 'add', '-A');
    assert.deepEqual(rows(suggestRefs(dir, { staged: true, today })), { must: [], nice: [] });
  } finally {
    cleanup(dir);
  }
});
