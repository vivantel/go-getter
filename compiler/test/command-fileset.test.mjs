import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileSet, fileSetHash } from '../src/secrets/fileset.mjs';

function project(files = {}) {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-fileset-')));
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  };
  for (const [rel, text] of Object.entries(files)) put(rel, text);
  return { dir, put, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
const set = (p, command) => fileSet(command.split(' '), p.dir);

test('a command that runs a script is bound to that script, and to nothing unrelated', () => {
  const p = project({ 'scripts/a.mjs': 'console.log(1);\n', 'README.md': 'x\n' });
  try {
    const before = fileSetHash(['node', 'scripts/a.mjs'], p.dir);
    assert.deepEqual(set(p, 'node scripts/a.mjs').files, ['scripts/a.mjs']);
    assert.equal(fileSetHash(['node', 'scripts/a.mjs'], p.dir), before, 'stable');
    p.put('README.md', 'changed\n');
    p.put('docs/other.md', 'new file\n');
    assert.equal(fileSetHash(['node', 'scripts/a.mjs'], p.dir), before, 'unrelated files do not matter');
    p.put('scripts/a.mjs', 'console.log(2);\n');
    assert.notEqual(fileSetHash(['node', 'scripts/a.mjs'], p.dir), before, 'the script itself does');
    assert.notEqual(fileSetHash(['node', 'scripts/a.mjs', 'write'], p.dir), fileSetHash(['node', 'scripts/a.mjs'], p.dir), 'other arguments, other hash');
  } finally {
    p.cleanup();
  }
});

test('local imports count, transitively, in every JavaScript form; packages and missing files do not', () => {
  const p = project({
    'scripts/a.mjs': "import { b } from './b.mjs';\nimport x from 'left-pad';\nimport './missing.mjs';\nexport * from '../lib/re-export.js';\nconst d = await import('./dyn.mjs');\n",
    'scripts/b.mjs': "import c from '../lib/c';\nexport const b = 1;\n",
    'lib/c.js': "const t = require('./deep.cjs');\nmodule.exports = t;\n",
    'lib/deep.cjs': 'module.exports = 1;\n',
    'lib/re-export.js': 'export const r = 1;\n',
    'scripts/dyn.mjs': 'export default 1;\n',
    'lib/index-dir/index.js': 'export {};\n',
    'node_modules/left-pad/index.js': 'x\n',
  });
  try {
    const r = set(p, 'node scripts/a.mjs');
    assert.deepEqual(r.files, ['lib/c.js', 'lib/deep.cjs', 'lib/re-export.js', 'scripts/a.mjs', 'scripts/b.mjs', 'scripts/dyn.mjs']);
    for (const file of ['lib/deep.cjs', 'lib/c.js', 'scripts/dyn.mjs', 'lib/re-export.js', 'scripts/b.mjs']) {
      const before = fileSetHash(['node', 'scripts/a.mjs'], p.dir);
      p.put(file, `// edited ${file}\n`);
      assert.notEqual(fileSetHash(['node', 'scripts/a.mjs'], p.dir), before, `${file} is in the set`);
    }
    const before = fileSetHash(['node', 'scripts/a.mjs'], p.dir);
    p.put('node_modules/left-pad/index.js', 'changed\n');
    p.put('lib/index-dir/index.js', 'changed\n');
    assert.equal(fileSetHash(['node', 'scripts/a.mjs'], p.dir), before, 'a package and an unimported file are not');
  } finally {
    p.cleanup();
  }
});

test('a cycle terminates, a directory index resolves, and a missing entry resolves to nothing', () => {
  const p = project({ 'a.mjs': "import './b.mjs';\nimport './dir';\n", 'b.mjs': "import './a.mjs';\n", 'dir/index.mjs': 'export {};\n' });
  try {
    assert.deepEqual(set(p, 'node a.mjs').files, ['a.mjs', 'b.mjs', 'dir/index.mjs']);
    const none = set(p, 'node nowhere.mjs');
    assert.deepEqual([none.files, none.resolved], [[], false]);
    assert.equal(fileSetHash(['node', 'nowhere.mjs'], p.dir), fileSetHash(['node', 'nowhere.mjs'], p.dir), 'a command with no file hashes its words');
    assert.notEqual(fileSetHash(['node', 'nowhere.mjs'], p.dir), fileSetHash(['node', 'other.mjs'], p.dir));
  } finally {
    p.cleanup();
  }
});

test('an npm script is followed: package.json and the files its commands run', () => {
  const p = project({
    'package.json': JSON.stringify({ scripts: { check: 'node scripts/x.mjs && sh scripts/y.sh arg', test: 'node --test', noop: 'echo hi' } }),
    'scripts/x.mjs': "import './x-helper.mjs';\n",
    'scripts/x-helper.mjs': 'export {};\n',
    'scripts/y.sh': '#!/bin/sh\n. ./scripts/lib.sh\nnode scripts/z.js\n',
    'scripts/lib.sh': 'echo lib\n',
    'scripts/z.js': 'console.log(1);\n',
    'unrelated.txt': 'x\n',
  });
  try {
    const r = set(p, 'npm run check');
    assert.deepEqual(r.files, ['package.json', 'scripts/lib.sh', 'scripts/x-helper.mjs', 'scripts/x.mjs', 'scripts/y.sh', 'scripts/z.js']);
    assert.deepEqual(set(p, 'npm run noop').files, ['package.json']);
    assert.deepEqual(set(p, 'npm test').files, ['package.json']);
    assert.deepEqual(set(p, 'pnpm run check').files, r.files);
    p.put('scripts/lib.sh', 'echo changed\n');
    assert.notEqual(set(p, 'npm run check').hash, r.hash, 'a sourced file changes the hash');
  } finally {
    p.cleanup();
  }
});

test('a shell script, a python script and a ruby script follow their local includes', () => {
  const p = project({
    'run.sh': '#!/bin/bash\nsource helpers/h.sh\n./helpers/tool.sh\n',
    'helpers/h.sh': 'x=1\n',
    'helpers/tool.sh': 'echo tool\n',
    'app.py': 'import util\nfrom pkg import mod\nfrom . import sibling\nimport os, sys\n',
    'util.py': 'x = 1\n',
    'pkg/__init__.py': '',
    'pkg/mod.py': 'y = 2\n',
    'sibling.py': 'z = 3\n',
    'app.rb': "require_relative 'lib/thing'\nrequire 'json'\n",
    'lib/thing.rb': 'class Thing; end\n',
  });
  try {
    assert.deepEqual(set(p, 'bash run.sh').files, ['helpers/h.sh', 'helpers/tool.sh', 'run.sh']);
    assert.deepEqual(set(p, 'python3 app.py').files, ['app.py', 'pkg/__init__.py', 'pkg/mod.py', 'sibling.py', 'util.py']);
    assert.deepEqual(set(p, 'ruby app.rb').files, ['app.rb', 'lib/thing.rb']);
    assert.deepEqual(set(p, './run.sh').files, ['helpers/h.sh', 'helpers/tool.sh', 'run.sh'], 'a script run by its own path');
  } finally {
    p.cleanup();
  }
});

test('a file outside the project is not followed, by real path; nothing outside enters the hash', () => {
  const outside = project({ 'secret.mjs': 'export const s = 1;\n' });
  const p = project({ 'a.mjs': "import './link.mjs';\nimport '../escape.mjs';\n" });
  try {
    symlinkSync(path.join(outside.dir, 'secret.mjs'), path.join(p.dir, 'link.mjs'));
    assert.deepEqual(set(p, 'node a.mjs').files, ['a.mjs']);
    const before = fileSetHash(['node', 'a.mjs'], p.dir);
    outside.put('secret.mjs', 'export const s = 2;\n');
    assert.equal(fileSetHash(['node', 'a.mjs'], p.dir), before);
    symlinkSync(path.join(p.dir, 'a.mjs'), path.join(p.dir, 'alias.mjs'));
    assert.deepEqual(set(p, 'node alias.mjs').files, ['a.mjs'], 'a symlink inside the project resolves to its target');
  } finally {
    p.cleanup();
    outside.cleanup();
  }
});

test('the bounds hold: a long import chain is cut and reported, a huge file is not read', () => {
  const files = {};
  for (let n = 0; n < 40; n++) files[`chain/m${n}.mjs`] = n < 39 ? `import './m${n + 1}.mjs';\n` : 'export {};\n';
  files['big.mjs'] = `// ${'x'.repeat(1024 * 1024 + 10)}\nimport './small.mjs';\n`;
  files['small.mjs'] = 'export {};\n';
  const p = project(files);
  try {
    const long = set(p, 'node chain/m0.mjs');
    assert.equal(long.truncated, true);
    assert.ok(long.files.length <= 27, `${long.files.length} files`);
    const big = set(p, 'node big.mjs');
    assert.deepEqual([big.files, big.truncated], [['big.mjs'], true], 'the oversized file is hashed but its imports are not read');
  } finally {
    p.cleanup();
  }
});

test('the hash does not depend on the order files are found in', () => {
  const a = project({ 'x.mjs': "import './a.mjs';\nimport './b.mjs';\n", 'a.mjs': '1\n', 'b.mjs': '2\n' });
  const b = project({ 'x.mjs': "import './b.mjs';\nimport './a.mjs';\n", 'a.mjs': '1\n', 'b.mjs': '2\n' });
  try {
    assert.deepEqual(set(a, 'node x.mjs').files, set(b, 'node x.mjs').files);
    assert.notEqual(set(a, 'node x.mjs').hash, set(b, 'node x.mjs').hash, 'x.mjs differs (import order is in its text)');
    b.put('x.mjs', "import './a.mjs';\nimport './b.mjs';\n");
    assert.equal(set(a, 'node x.mjs').hash, set(b, 'node x.mjs').hash);
  } finally {
    a.cleanup();
    b.cleanup();
  }
});
