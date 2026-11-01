// Dogfood install (roadmap T2, decision 0160): the pinned plugin ref, the version check and the doctor mismatch line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compareVersions, installedPluginVersion, latestTag, pinnedRef } from '../src/plugin-pin.mjs';
import { pinProblem } from '../src/checks/plugin-pin.mjs';
import { hostHookOutputs } from '../src/apply.mjs';
import doctorCommand from '../src/commands/doctor.mjs';

const tmp = () => realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-pin-')));
const write = (file, text) => (mkdirSync(path.dirname(file), { recursive: true }), writeFileSync(file, text));
const ROOT = path.resolve(import.meta.dirname, '..', '..');

test('versions compare numerically, not as text', () => {
  assert.equal(compareVersions('v0.9.0', 'v0.10.0'), -1);
  assert.equal(compareVersions('0.4.1', 'v0.4.1'), 0);
});

test('latestTag picks the highest release tag and ignores other tags', () => {
  assert.equal(latestTag('x', () => 'v0.4.0\nv0.10.0\nv0.9.2\nnightly\n'), 'v0.10.0');
  assert.equal(latestTag('x', () => ''), null);
  assert.equal(latestTag('x', () => { throw new Error('not a repo'); }), null);
});

test('the check fails on a deliberately stale pin and passes on a current or newer one', () => {
  assert.match(pinProblem('v0.3.6', 'v0.4.1'), /older than the latest release v0\.4\.1/);
  assert.equal(pinProblem('v0.4.1', 'v0.4.1'), null);
  assert.equal(pinProblem('v0.4.2', 'v0.4.1'), null); // a release PR pins the version before its tag exists
  assert.equal(pinProblem('v0.4.1', null), null);
  assert.match(pinProblem(null, 'v0.4.1'), /no pinned plugin ref/);
  assert.match(pinProblem('main', 'v0.4.1'), /not a release tag/);
});

test('apply writes the pin and enablement only when the project gives the answer, and keeps other settings', () => {
  const plugin = { marketplace: 'go-getter', repo: 'vivantel/go-getter', version: '0.4.1' };
  const existing = { model: 'x', enabledPlugins: { 'other@m': true } };
  const read = () => existing;
  const out = JSON.parse(hostHookOutputs('/p', ['claude-code'], false, false, false, false, false, read, plugin)['.claude/settings.json'].content);
  assert.deepEqual(out.extraKnownMarketplaces['go-getter'].source, { source: 'github', repo: 'vivantel/go-getter', ref: 'v0.4.1' });
  assert.deepEqual(out.enabledPlugins, { 'other@m': true, 'go-getter@go-getter': true });
  assert.equal(out.model, 'x');
  assert.equal(hostHookOutputs('/p', ['claude-code'], false, false, false, false, false, read, null)['.claude/settings.json'], undefined);
});

test('the pinned ref and the installed version are read from the settings and the host plugin list', () => {
  const base = tmp();
  try {
    const project = path.join(base, 'proj');
    write(path.join(project, '.claude/settings.json'), JSON.stringify({ extraKnownMarketplaces: { 'go-getter': { source: { ref: 'v0.4.1' } } } }));
    assert.equal(pinnedRef(project), 'v0.4.1');
    assert.equal(pinnedRef(path.join(base, 'none')), null);
    const home = path.join(base, 'home');
    write(path.join(home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'go-getter@go-getter': [
      { scope: 'user', version: '0.3.6' },
      { scope: 'project', projectPath: '/elsewhere', version: '0.1.0' },
      { scope: 'project', projectPath: project, version: '0.4.0' },
    ] } }));
    assert.equal(installedPluginVersion(project, undefined, home), '0.4.0');
    assert.equal(installedPluginVersion(path.join(base, 'other'), undefined, home), '0.3.6');
    assert.equal(installedPluginVersion(project, undefined, path.join(base, 'nohome')), null);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('doctor prints the mismatch and the fix, and exits 0', () => {
  const base = tmp();
  const savedHome = process.env.HOME;
  const log = console.log;
  const lines = [];
  try {
    write(path.join(base, 'home/.claude/plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'go-getter@go-getter': [{ scope: 'user', version: '0.0.1' }] } }));
    process.env.HOME = path.join(base, 'home');
    console.log = (m) => lines.push(m);
    assert.equal(doctorCommand({ root: ROOT, args: ['--project', base] }), 0);
    assert.match(lines.join('\n'), /plugin is 0\.0\.1 but the CLI is \d+\.\d+\.\d+; run "claude plugin update go-getter@go-getter"/);
  } finally {
    console.log = log;
    process.env.HOME === undefined || (process.env.HOME = savedHome);
    rmSync(base, { recursive: true, force: true });
  }
});
