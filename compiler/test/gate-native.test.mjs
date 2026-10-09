import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOSTS, loadCapabilities } from '../src/capabilities.mjs';
import { CATALOG, extraEntries, nativeRules } from '../src/gate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const caps = loadCapabilities(root);
const NATIVE = ['claude-code', 'kilo', 'opencode'];

// The vendors' glob: `*` matches any text, and a trailing ` *` also matches the bare command (Claude Code permissions,
// OpenCode `Wildcard.match`).
const globMatch = (command, glob) => {
  let re = glob.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*');
  if (re.endsWith(' .*')) re = `${re.slice(0, -3)}( .*)?`;
  return new RegExp(`^${re}$`, 's').test(command);
};
const globsOf = (host, entries) => {
  const rules = nativeRules(host, entries, caps);
  return Array.isArray(rules) ? rules.map((r) => r.replace(/^Bash\((.*)\)$/s, '$1')) : Object.keys(rules);
};

test('only Claude Code, Kilo and OpenCode declare native ask rules', () => {
  for (const host of HOSTS) assert.equal(Boolean(caps[host].permissions.ask), NATIVE.includes(host), host);
  assert.deepEqual(NATIVE.map((h) => caps[h].permissions.ask), [
    { file: '.claude/settings.json', format: 'claude-permissions' },
    { file: 'kilo.json', format: 'opencode-permission' },
    { file: 'opencode.json', format: 'opencode-permission' },
  ]);
  for (const h of NATIVE) assert.equal(caps[h].permissions.ask.file, caps[h].permissions.config);
});

test('the other four hosts get no native rules', () => {
  for (const host of HOSTS.filter((h) => !NATIVE.includes(h))) assert.equal(nativeRules(host, CATALOG, caps), null, host);
});

test('Claude Code gets Bash(...) rules in a list', () => {
  const rules = nativeRules('claude-code', CATALOG, caps);
  assert.ok(Array.isArray(rules) && rules.every((r) => /^Bash\(.+\)$/.test(r)));
  assert.ok(rules.includes('Bash(git push *)'));
  assert.equal(new Set(rules).size, rules.length);
});

test('Kilo and OpenCode get a permission.bash map of ask, never deny', () => {
  for (const host of ['kilo', 'opencode']) {
    const map = nativeRules(host, CATALOG, caps);
    assert.equal(map['git push *'], 'ask');
    assert.deepEqual([...new Set(Object.values(map))], ['ask']);
  }
});

test('every catalog entry has globs that cover its match examples', () => {
  for (const host of NATIVE) {
    for (const entry of CATALOG) {
      const globs = globsOf(host, [entry]);
      assert.ok(globs.length, `${entry.id} has native globs`);
      // `git -C dir push` is matched by the hook-side matcher only (see the note on NATIVE in gate.mjs)
      for (const c of entry.examples.match.filter((c) => !/ -C /.test(c))) {
        assert.ok(globs.some((g) => globMatch(c, g)), `${host}: ${entry.id} covers "${c}"`);
      }
    }
  }
});

test('globs do not cover ordinary commands', () => {
  const globs = globsOf('claude-code', CATALOG);
  for (const c of ['git status', 'git pull', 'git stash push', 'git branch -d merged', 'npm install', 'rm file', 'psql -c "select 1"', 'gh pr view 5']) {
    assert.ok(!globs.some((g) => globMatch(c, g)), `no rule covers "${c}"`);
  }
});

test('the classes chosen decide the rules', () => {
  const irreversible = globsOf('claude-code', CATALOG.filter((e) => e.class === 'irreversible'));
  assert.ok(!irreversible.includes('git push *'));
  assert.ok(irreversible.some((g) => globMatch('git push --force', g)));
  assert.ok(globsOf('claude-code', []).length === 0);
});

test('extra command prefixes become rules and regexes are left to the hook', () => {
  const extra = extraEntries(['make deploy', '/kubectl .*prod/', '']);
  assert.deepEqual(nativeRules('claude-code', extra, caps), ['Bash(make deploy *)']);
  assert.deepEqual(nativeRules('opencode', extra, caps), { 'make deploy *': 'ask' });
});
