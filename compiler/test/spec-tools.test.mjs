import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detectSpecTool, changeOfPath, changesTouched } from '../src/spec-tools.mjs';
import { detect } from '../src/detect.mjs';

function fixture(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-spec-'));
  for (const rel of files) {
    if (rel.endsWith('/')) mkdirSync(path.join(dir, rel), { recursive: true });
    else {
      mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      writeFileSync(path.join(dir, rel), '');
    }
  }
  return dir;
}

test('OpenSpec is detected by config.yaml, specs/ or changes/ and not by an empty or absent openspec/', () => {
  for (const [files, expected] of [
    [['openspec/config.yaml'], 'openspec'],
    [['openspec/specs/'], 'openspec'],
    [['openspec/changes/'], 'openspec'],
    [['openspec/'], null],
    [['docs/notes.md'], null],
  ]) {
    const dir = fixture(files);
    assert.equal(detectSpecTool(dir), expected, files.join());
    rmSync(dir, { recursive: true, force: true });
  }
});

test('go-getter detect reports specTool', () => {
  const dir = fixture(['openspec/config.yaml']);
  assert.equal(detect(dir).specTool, 'openspec');
  rmSync(dir, { recursive: true, force: true });
});

test('a path resolves to its change folder, live or archived', () => {
  assert.deepEqual(changeOfPath('openspec/changes/add-x/proposal.md'), { tool: 'openspec', id: 'add-x', folder: 'openspec/changes/add-x', archived: false });
  assert.deepEqual(changeOfPath('openspec/changes/add-x/specs/a/spec.md'), { tool: 'openspec', id: 'add-x', folder: 'openspec/changes/add-x', archived: false });
  assert.deepEqual(changeOfPath('openspec/changes/archive/2026-10-10-add-x/tasks.md'), {
    tool: 'openspec', id: 'add-x', folder: 'openspec/changes/archive/2026-10-10-add-x', archived: true,
  });
  assert.equal(changeOfPath('openspec/changes/00001-add-auth/design.md').id, '00001-add-auth');
});

test('paths that are not in a change folder resolve to null', () => {
  for (const p of ['openspec/specs/a/spec.md', 'openspec/config.yaml', 'openspec/changes/archive/README.md', 'openspec/changes/archive', 'openspec/changes/Bad_Name/x.md', 'src/openspec/changes/a/x.md', 'docs/decisions/0001-x.md']) {
    assert.equal(changeOfPath(p), null, p);
  }
});

test('changesTouched lists each change once, in first-seen order', () => {
  const files = ['src/a.mjs', 'openspec/changes/b-two/tasks.md', 'openspec/changes/a-one/proposal.md', 'openspec/changes/b-two/design.md', 'openspec/changes/archive/2026-10-10-c-three/tasks.md'];
  assert.deepEqual(changesTouched(files).map((c) => c.id), ['b-two', 'a-one', 'c-three']);
});
