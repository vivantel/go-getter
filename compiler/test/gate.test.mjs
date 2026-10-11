import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, matchGated } from '../src/gate.mjs';

const ids = (command, opts) => matchGated(command, opts).map((e) => e.id);

test('the catalog has both classes and unique ids', () => {
  assert.equal(new Set(CATALOG.map((e) => e.id)).size, CATALOG.length);
  assert.deepEqual([...new Set(CATALOG.map((e) => e.class))].sort(), ['irreversible', 'outward']);
});

for (const entry of CATALOG) {
  test(`${entry.id}: matches its examples and none of its non-examples`, () => {
    assert.ok(entry.examples.match.length && entry.examples.noMatch.length);
    for (const c of entry.examples.match) assert.ok(ids(c).includes(entry.id), `should match: ${c}`);
    for (const c of entry.examples.noMatch) assert.ok(!ids(c).includes(entry.id), `should not match: ${c}`);
  });
}

test('every segment of a compound command is checked', () => {
  assert.ok(ids('cd x && git push').includes('git-push'));
  assert.ok(ids('echo hi | git push').includes('git-push'));
  assert.ok(ids('make; git push origin main').includes('git-push'));
  assert.ok(ids('make\ngit push').includes('git-push'));
  assert.ok(ids('(cd x && git push)').includes('git-push'));
  assert.ok(ids('sleep 1 & git push').includes('git-push'));
});

test('leading variables, sudo and env are stripped', () => {
  assert.ok(ids('GIT_SSH_COMMAND="ssh -i k" git push').includes('git-push'));
  assert.ok(ids('sudo rm -rf /var/x').includes('rm-rf'));
  assert.ok(ids('sudo -u deploy git push').includes('git-push'));
  assert.ok(ids('env -i FOO=1 git push').includes('git-push'));
});

test('quoted text and ordinary commands do not match', () => {
  assert.deepEqual(ids('echo "git push"'), []);
  assert.deepEqual(ids("git commit -m 'git push --force && rm -rf /'"), []);
  assert.deepEqual(ids('echo "a && git push"'), []);
  assert.deepEqual(ids('git status'), []);
  assert.deepEqual(ids('git log 2>&1 | head'), []);
  assert.deepEqual(ids(''), []);
  assert.deepEqual(ids(undefined), []);
});

test('a wrapped command is matched on its literal text only', () => {
  assert.deepEqual(ids('sh -c "git push"'), []);
  assert.deepEqual(ids('eval git push'), []);
});

test('a force push is both irreversible and outward', () => {
  assert.deepEqual(ids('git push --force'), ['git-push-force', 'git-push']);
});

test('rm -rf is exempt only inside a temporary directory', () => {
  assert.deepEqual(ids('rm -rf /tmp/a /tmp/b'), []);
  assert.ok(ids('rm -rf /tmp/a build').includes('rm-rf'));
  assert.ok(ids('rm -rf /tmp').includes('rm-rf'));
});

test('classes filter the entries', () => {
  assert.deepEqual(ids('git push --force', { classes: ['outward'] }), ['git-push']);
  assert.deepEqual(ids('git push --force', { classes: ['irreversible'] }), ['git-push-force']);
  assert.deepEqual(ids('git push', { classes: ['irreversible'] }), []);
  assert.deepEqual(ids('git push', { classes: [] }), []);
});

test('extra patterns are command prefixes or /regex/ and ignore classes', () => {
  assert.deepEqual(ids('make deploy prod', { extra: ['make deploy'] }), ['extra:make deploy']);
  assert.deepEqual(ids('make deployment', { extra: ['make deploy'] }), []);
  assert.deepEqual(ids('kubectl --context prod apply -f x', { extra: ['/kubectl .*prod/'] }), ['extra:/kubectl .*prod/']);
  assert.deepEqual(ids('make deploy', { classes: ['irreversible'], extra: ['make deploy'] }), ['extra:make deploy']);
  assert.deepEqual(ids('make test', { extra: ['make deploy', ''] }), []);
});

test('free lists outward catalog ids that run without a human; irreversible ones cannot be freed', async () => {
  const { matchGated, gateEntries } = await import('../src/gate.mjs');
  const ids = (cmd, o) => matchGated(cmd, o).map((e) => e.id);
  assert.deepEqual(ids('git push origin feat/x', { free: ['git-push'] }), []);
  assert.deepEqual(ids('git push origin feat/x', {}), ['git-push']);
  assert.deepEqual(ids('git push --force origin feat/x', { free: ['git-push'] }), ['git-push-force'], 'force-push still asks');
  assert.deepEqual(ids('git push --delete origin old', { free: ['git-push'] }), ['git-push-delete']);
  assert.deepEqual(ids('gh pr merge 5', { free: ['git-push'] }), ['gh-pr'], 'other outward commands still ask');
  const gate = (run) => [{ tier: 2, guardrail: 'g', parsed: { kind: 'builtin', id: 'gate-command', args: run } }];
  const names = (args) => gateEntries(gate(args)).map((e) => e.id);
  assert.equal(names({ classes: 'irreversible,outward' }).includes('git-push'), true);
  assert.equal(names({ classes: 'irreversible,outward', free: 'git-push' }).includes('git-push'), false);
  assert.equal(names({ classes: 'irreversible,outward', free: 'git-push' }).includes('git-push-force'), true);
  assert.throws(() => gateEntries(gate({ classes: 'irreversible,outward', free: 'rm-rf' })), /free must name outward/);
  assert.throws(() => gateEntries(gate({ classes: 'irreversible,outward', free: 'nope' })), /free must name outward/);
});
