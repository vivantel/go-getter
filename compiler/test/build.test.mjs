import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, lstatSync, readlinkSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { compile, writeOutputs, readSkills, ADAPTERS } from '../src/build.mjs';
import { diffGenerated } from '../src/checks/generated.mjs';
import { HOSTS } from '../src/capabilities.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, 'fixtures/repo');
const goldenFile = path.join(here, 'golden/build.json');

function serialize(outputs) {
  return Object.fromEntries(
    Object.keys(outputs)
      .sort()
      .map((p) => [p, 'symlink' in outputs[p] ? { symlink: outputs[p].symlink } : Buffer.from(outputs[p].content).toString('utf8')]),
  );
}

function tempRepo() {
  const dir = mkdtempSync(path.join(tmpdir(), 'go-getter-build-'));
  cpSync(fixture, dir, { recursive: true, dereference: true });
  return dir;
}

test('golden: full build of the fixture repo', () => {
  const actual = serialize(compile({ root: fixture }));
  if (process.env.UPDATE_GOLDEN) {
    mkdirSync(path.dirname(goldenFile), { recursive: true });
    writeFileSync(goldenFile, `${JSON.stringify(actual, null, 2)}\n`);
  }
  assert.deepEqual(actual, JSON.parse(readFileSync(goldenFile, 'utf8')));
});

test('every host has an adapter and emits its own manifest', () => {
  assert.deepEqual(Object.keys(ADAPTERS).sort(), [...HOSTS].sort());
  const expectations = {
    'claude-code': 'plugins/go-getter/.claude-plugin/plugin.json',
    codex: 'plugins/go-getter/.codex-plugin/plugin.json',
    kilo: 'plugins/go-getter/skills/index.json',
    cursor: 'plugins/go-getter/plugin.json',
    copilot: 'plugins/go-getter/plugin.json',
    'gemini-cli': 'gemini-extension.json',
  };
  for (const [host, file] of Object.entries(expectations)) {
    const out = compile({ root: fixture, hosts: [host] });
    assert.ok(out[file], `${host} emits ${file}`);
    assert.ok(out['plugins/go-getter/skills/hello/SKILL.md'], `${host} ships shared skills`);
  }
  assert.equal(compile({ root: fixture, hosts: ['codex'] })['gemini-extension.json'], undefined);
});

test('symlink mode links skills/ to the shared skills; copy mode copies', () => {
  const linkRepo = tempRepo();
  writeOutputs(linkRepo, compile({ root: linkRepo }), { copy: false });
  assert.ok(lstatSync(path.join(linkRepo, 'skills')).isSymbolicLink());
  assert.equal(readlinkSync(path.join(linkRepo, 'skills')), path.join('plugins', 'go-getter', 'skills'));

  const copyRepo = tempRepo();
  writeOutputs(copyRepo, compile({ root: copyRepo }), { copy: true });
  assert.ok(lstatSync(path.join(copyRepo, 'skills')).isDirectory());
  assert.ok(existsSync(path.join(copyRepo, 'skills/hello/SKILL.md')));
  rmSync(linkRepo, { recursive: true, force: true });
  rmSync(copyRepo, { recursive: true, force: true });
});

test('drift check passes after build and catches edits, stray and missing files', () => {
  const repo = tempRepo();
  writeOutputs(repo, compile({ root: repo }), { copy: false });
  assert.deepEqual(diffGenerated(repo, { copy: false }), []);

  writeFileSync(path.join(repo, 'plugins/go-getter/skills/hello/SKILL.md'), 'hand edit\n');
  writeFileSync(path.join(repo, 'plugins/go-getter/stray.txt'), 'x');
  rmSync(path.join(repo, 'gemini-extension.json'));
  const problems = diffGenerated(repo, { copy: false });
  assert.ok(problems.includes('differs: plugins/go-getter/skills/hello/SKILL.md'));
  assert.ok(problems.includes('not generated (stale or hand-added): plugins/go-getter/stray.txt'));
  assert.ok(problems.includes('missing: gemini-extension.json'));
  rmSync(repo, { recursive: true, force: true });
});

test('vendored skills are compiled and every relative reference resolves on each install root', () => {
  const repoRoot = path.resolve(here, '..', '..');
  const outputs = compile({ root: repoRoot });
  const vendoredSkills = Object.keys(outputs).filter((p) => /^plugins\/go-getter\/skills\/[^/]+\/SKILL\.md$/.test(p));
  assert.ok(vendoredSkills.length >= 14, `expected vendored skills, got ${vendoredSkills.length}`);
  const tmp = mkdtempSync(path.join(tmpdir(), 'go-getter-refs-'));
  writeOutputs(tmp, outputs, { copy: false });
  let checked = 0;
  // Plugin root (Claude Code, Codex, Cursor, Copilot) and repo root via symlinks (Gemini CLI).
  for (const base of ['plugins/go-getter/skills', 'skills']) {
    for (const p of vendoredSkills) {
      const skillDir = path.join(tmp, base, path.basename(path.dirname(p)));
      const text = readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
      for (const [ref] of text.matchAll(/\.\.\/[A-Za-z0-9_./-]+/g)) {
        assert.ok(existsSync(path.join(skillDir, ref)), `${base}/${path.basename(skillDir)} -> ${ref}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 0);
  rmSync(tmp, { recursive: true, force: true });
});

test('skill validation rejects bad names, missing descriptions and non-standard fields', () => {
  const repo = tempRepo();
  const skill = path.join(repo, 'src/skills/hello/SKILL.md');
  writeFileSync(skill, '---\nname: other\ndescription: x\n---\n');
  assert.throws(() => readSkills(path.join(repo, 'src')), /must equal the directory name/);
  writeFileSync(skill, '---\nname: hello\n---\n');
  assert.throws(() => readSkills(path.join(repo, 'src')), /description is required/);
  writeFileSync(skill, '---\nname: hello\ndescription: x\nmodel: big\n---\n');
  assert.throws(() => readSkills(path.join(repo, 'src')), /non-standard frontmatter model/);
  rmSync(repo, { recursive: true, force: true });
});

test('go-getter-init carries a CLI copy that runs from where it is installed (decision 0093)', () => {
  const root = path.resolve(here, '..', '..');
  const outputs = compile({ root, hosts: ['claude-code', 'kilo'] });
  const base = 'plugins/go-getter/skills/go-getter-init/cli';
  for (const f of ['package.json', 'compiler/bin/go-getter.mjs', 'compiler/src/apply.mjs', 'src/packs/context/pack.json']) {
    assert.ok(outputs[`${base}/${f}`], `${f} is bundled`);
  }
  assert.ok(!Object.keys(outputs).some((p) => p.startsWith(`${base}/compiler/test`)), 'tests are not bundled');
  assert.ok(!outputs['plugins/go-getter/skills/attribute/cli/package.json'], 'only the skills that run the CLI carry it');
  const index = JSON.parse(outputs['plugins/go-getter/skills/index.json'].content);
  const init = index.skills.find((s) => s.name === 'go-getter-init');
  assert.ok(init.files.includes('cli/compiler/bin/go-getter.mjs'), 'remote skill indexes list the bundled files');

  const installed = mkdtempSync(path.join(tmpdir(), 'go-getter-bundle-'));
  try {
    writeOutputs(installed, outputs);
    const cli = path.join(installed, base, 'compiler/bin/go-getter.mjs');
    const run = (args) => spawnSync('node', [cli, ...args], { cwd: installed, encoding: 'utf8' });
    const packs = run(['packs']);
    assert.equal(packs.status, 0, packs.stderr);
    assert.match(packs.stdout, /^context@/m);
    const applied = run(['apply', '--skills', '--hosts', 'claude-code']);
    assert.equal(applied.status, 0, applied.stderr);
    assert.ok(existsSync(path.join(installed, '.agents/skills/go-getter-init/cli/compiler/bin/go-getter.mjs')), 'project-local skills keep their CLI');
  } finally {
    rmSync(installed, { recursive: true, force: true });
  }
});
