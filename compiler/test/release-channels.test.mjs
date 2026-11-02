import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchGated, channelOf, gateEntries, nativeRules } from '../src/gate.mjs';
import { loadCapabilities } from '../src/capabilities.mjs';

const ids = (command, channels = []) => matchGated(command, { channels }).map((e) => e.id);
const gate = (channels) => [{ tier: 2, guardrail: 'g', parsed: { kind: 'builtin', id: 'gate-command', args: { classes: 'irreversible,outward', channels } } }];

test('channelOf reads the channel from the flags and the version, never from quoted text', () => {
  assert.equal(channelOf('release-create', 'gh release create v1.2.0 --prerelease'), 'prerelease');
  assert.equal(channelOf('release-create', 'gh release create v1.2.0-rc.1'), 'prerelease');
  assert.equal(channelOf('release-create', 'gh release create v1.2.0'), 'production');
  assert.equal(channelOf('release-create', 'gh release create --title v1.2.0-rc.1 v1.2.0'), 'production', 'a flag value is not the version');
  assert.equal(channelOf('package-publish', 'npm publish --tag next'), 'dist-tag:next');
  assert.equal(channelOf('package-publish', 'npm publish --tag=beta'), 'dist-tag:beta');
  assert.equal(channelOf('package-publish', 'npm publish --tag latest'), 'production');
  assert.equal(channelOf('package-publish', 'npm publish'), 'production');
});

test('a listed channel runs without a stop and an unlisted one stays gated', () => {
  assert.deepEqual(ids('gh release create v1.2.0 --prerelease', ['prerelease']), []);
  assert.deepEqual(ids('gh release create v1.2.0-rc.1', ['prerelease']), []);
  assert.deepEqual(ids('npm publish --tag next', ['dist-tag:next']), []);
  assert.deepEqual(ids('gh release create v1.2.0', ['prerelease']), ['release-create']);
  assert.deepEqual(ids('npm publish --tag beta', ['dist-tag:next']), ['package-publish']);
  assert.deepEqual(ids('npm publish', ['dist-tag:next', 'prerelease']), ['package-publish']);
  assert.deepEqual(ids('gh release create v1.2.0 --prerelease'), ['release-create'], 'nothing is free by default');
});

test('quoted text and a chained command cannot carry a production release through a free channel', () => {
  assert.deepEqual(ids('gh release create v1.2.0 --notes "--prerelease"', ['prerelease']), ['release-create']);
  assert.deepEqual(ids('npm publish --tag next && npm publish', ['dist-tag:next']), ['package-publish']);
});

test('creating a tag is free, and deleting one is not', () => {
  assert.deepEqual(ids('git tag v1.2.0'), []);
  assert.deepEqual(ids('git tag -a v1.2.0 -m x'), []);
  assert.deepEqual(ids('git tag -d v1.2.0'), ['git-tag-delete']);
});

test('repo-settings stays gated whatever channels are listed', () => {
  assert.deepEqual(ids('gh repo edit --default-branch dev', ['prerelease', 'dist-tag:next']), ['repo-settings']);
});

test('a channel that is production or malformed is refused', () => {
  for (const bad of ['dist-tag:latest', 'production', 'prerelease;x', 'stage']) assert.throws(() => gateEntries(gate(bad)), /channels must be/, bad);
  assert.doesNotThrow(() => gateEntries(gate('prerelease,dist-tag:next')));
});

test('with channels listed the release and publish entries lose their static ask rule on a host whose hook can ask', () => {
  const caps = loadCapabilities(process.cwd());
  const without = nativeRules('claude-code', gateEntries(gate('')), caps);
  const withChannels = nativeRules('claude-code', gateEntries(gate('prerelease')), caps);
  for (const glob of ['Bash(gh release create *)', 'Bash(npm publish *)']) {
    assert.ok(without.includes(glob), `${glob} asks natively without channels`);
    assert.ok(!withChannels.includes(glob), `${glob} is left to the hook with channels`);
  }
  assert.ok(withChannels.includes('Bash(gh repo edit *)'), 'repo settings keep their rule');
  assert.ok(!without.includes('Bash(git tag *)'), 'a tag has no rule');
});
