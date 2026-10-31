// Decision 0152: allow rules printed for commands the project frees or approves; never written.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadPack } from '../src/packs.mjs';
import { planRender, applyRender } from '../src/render.mjs';
import { allowSuggestions, formatSuggestions, suggestedCommands } from '../src/allow-rules.mjs';
import { loadCapabilities, HOSTS } from '../src/capabilities.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');
const hitl = loadPack(path.join(root, 'src/packs/hitl/pack.json'));
const tracker = loadPack(path.join(root, 'src/packs/tracker/pack.json'));
const caps = loadCapabilities(root);

function project({ free = [], writes } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-allow-'));
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(dir, 'docs/skills/tags.md'), '# Tags\n\npractice-packs — x\nhooks — x\nroadmap — x\nguardrail — x\n');
  writeFileSync(path.join(dir, 'docs/decisions/0043-human-escalation.md'), '---\nid: 0043-human-escalation\ntitle: Human escalation\nstatus: active\ndate: 2026-10-05\ntags: [hooks]\ntrack: process\n---\n\nx\n');
  const adopt = (pack, answers) => applyRender({ root: dir, plan: planRender({ root: dir, pack, answers, acceptedBy: 't', date: '2026-10-31' }) });
  adopt(hitl, { 'gated-classes': 'both', 'extra-patterns': [], 'free-commands': free, 'run-grants': [] });
  if (writes) adopt(tracker, { tracker: 'github', writes });
  mkdirSync(path.join(dir, '.claude'), { recursive: true });
  return dir;
}
const cleanup = (dir) => rmSync(dir, { recursive: true, force: true });
const commandsOf = (dir) => suggestedCommands(dir).map((c) => c.command);
const tree = (dir) => {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out[path.relative(dir, p)] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return out;
};

test('nothing is printed when nothing is freed and writes are off', () => {
  for (const dir of [project(), project({ writes: 'off' })]) {
    assert.deepEqual(suggestedCommands(dir), []);
    assert.deepEqual(allowSuggestions(dir, ['claude-code'], { caps }), []);
    assert.deepEqual(formatSuggestions([]), []);
    cleanup(dir);
  }
});

test('free-commands gives the freed command, derived from the catalog', () => {
  const dir = project({ free: ['git-push', 'pr-merge'] });
  assert.deepEqual(commandsOf(dir), ['git push', 'gh pr merge']);
  const [s] = allowSuggestions(dir, ['claude-code'], { caps });
  assert.equal(s.file, '.claude/settings.local.json');
  assert.deepEqual(s.rules, ['Bash(git push:*)', 'Bash(gh pr merge:*)']);
  cleanup(dir);
});

test('the earlier GitHub-named ids are read as the catalog ids', () => {
  const dir = project({ free: ['gh-pr-merge'] });
  assert.deepEqual(commandsOf(dir), ['gh pr merge']);
  cleanup(dir);
});

test('tracker writes ask and allow both give the three plan issue verbs; off gives none', () => {
  for (const writes of ['ask', 'allow']) {
    const dir = project({ writes });
    assert.deepEqual(allowSuggestions(dir, ['claude-code'], { caps })[0].rules, ['create', 'comment', 'close'].map((v) => `Bash(go-getter plan issue ${v}:*)`), writes);
    cleanup(dir);
  }
  const dir = project({ writes: 'off' });
  assert.deepEqual(commandsOf(dir), []);
  cleanup(dir);
});

test('a checkout spells the runner as the example does', () => {
  const dir = project({ writes: 'allow' });
  mkdirSync(path.join(dir, 'compiler/bin'), { recursive: true });
  writeFileSync(path.join(dir, 'compiler/bin/go-getter.mjs'), '');
  assert.ok(allowSuggestions(dir, ['claude-code'], { caps })[0].rules.includes('Bash(node compiler/bin/go-getter.mjs plan issue create:*)'));
  cleanup(dir);
});

test('both sources combine and an irreversible command is never suggested', () => {
  const dir = project({ free: ['git-push'], writes: 'ask' });
  const cmds = commandsOf(dir);
  assert.equal(cmds.length, 4);
  assert.ok(!cmds.some((c) => /force|delete|reset|rm|rebase/.test(c)));
  cleanup(dir);
});

test('rules are no wider than the command: fixed words, one trailing :*, no other wildcard', () => {
  const dir = project({ free: ['git-push', 'pr-create', 'pr-merge', 'pr-close', 'comment-post', 'release-create', 'package-publish', 'git-tag-create'], writes: 'allow' });
  const rules = allowSuggestions(dir, ['claude-code'], { caps })[0].rules;
  assert.ok(rules.length > 8);
  for (const rule of rules) {
    assert.match(rule, /^Bash\([A-Za-z0-9._/-]+(?: [A-Za-z0-9._/-]+)*:\*\)$/, rule);
    assert.ok(rule.split(' ').length >= 2 || rule.includes(' '), `names a subcommand: ${rule}`);
    assert.ok(!['Bash(*)', 'Bash(git:*)', 'Bash(gh:*)', 'Bash(npm:*)', 'Bash(go-getter:*)'].includes(rule), rule);
  }
  cleanup(dir);
});

test('only hosts that declare a person-owned allow layer get a suggestion', () => {
  const dir = project({ free: ['git-push'] });
  const declared = HOSTS.filter((h) => caps[h].permissions.userAllow);
  assert.deepEqual(declared, ['claude-code']);
  assert.deepEqual(allowSuggestions(dir, HOSTS, { caps }).map((s) => s.host), ['claude-code']);
  assert.deepEqual(allowSuggestions(dir, ['kilo', 'opencode', 'codex'], { caps }), []);
  cleanup(dir);
});

test('the text names the file, says the person adds it, and that go-getter does not', () => {
  const dir = project({ free: ['pr-merge'] });
  const text = formatSuggestions(allowSuggestions(dir, ['claude-code'], { caps })).join('\n');
  assert.match(text, /\.claude\/settings\.local\.json/);
  assert.match(text, /yourself/);
  assert.match(text, /\{"permissions":\{"allow":\["Bash\(gh pr merge:\*\)"\]\}\}/);
  assert.match(text, /\.git\/info\/exclude/);
  assert.match(text, /never write/);
  cleanup(dir);
});

test('doctor prints the rules and the project tree is unchanged', () => {
  const dir = project({ free: ['pr-merge'], writes: 'ask' });
  const before = tree(dir);
  const r = spawnSync(process.execPath, [cli, 'doctor', '--project', dir, '--hosts', 'claude-code'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Bash\(gh pr merge:\*\)/);
  assert.deepEqual(tree(dir), before);
  assert.ok(!Object.keys(tree(dir)).some((f) => f.endsWith('settings.local.json')));
  cleanup(dir);
});

test('doctor says so when nothing is freed, and writes nothing', () => {
  const dir = project();
  const before = tree(dir);
  const r = spawnSync(process.execPath, [cli, 'doctor', '--project', dir, '--hosts', 'claude-code'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no command is freed/);
  assert.deepEqual(tree(dir), before);
  cleanup(dir);
});

test('apply prints the rules in its report and still writes no local settings file', () => {
  const dir = project({ free: ['pr-merge'] });
  spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  writeFileSync(path.join(dir, 'AGENTS.md'), '# Project\n');
  const r = spawnSync(process.execPath, [cli, 'apply', '--project', dir, '--hosts', 'claude-code'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Bash\(gh pr merge:\*\)/);
  assert.ok(!Object.keys(tree(dir)).some((f) => f.endsWith('settings.local.json')));
  const settings = JSON.parse(readFileSync(path.join(dir, '.claude/settings.json'), 'utf8'));
  assert.ok(!(settings.permissions.allow ?? []).some((a) => /gh pr merge/.test(a)), 'the committed settings gain no allow rule');
  cleanup(dir);
});
