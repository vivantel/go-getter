import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readArtifacts } from '../../src/artifacts.mjs';
import { loadCapabilities } from '../../src/capabilities.mjs';
import { delegatedModel } from '../../src/routing/delegate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const capabilities = loadCapabilities(root);
const priced = readArtifacts(root, ['facts']).find((f) => f.data.id === '0011-model-pricing-anthropic').data['go-getter'].models;

test("Claude Code's Agent tool gets one of its four aliases for every priced Anthropic model", () => {
  assert.ok(priced.length > 0);
  for (const { id } of priced) {
    assert.ok(['sonnet', 'opus', 'haiku', 'fable'].includes(delegatedModel(capabilities['claude-code'].routing.delegation, id)), id);
  }
  assert.equal(delegatedModel(capabilities['claude-code'].routing.delegation, 'claude-opus-5-5'), 'opus');
});

test('an unmappable model has no value; hosts without an alias table take the full id', () => {
  assert.equal(delegatedModel(capabilities['claude-code'].routing.delegation, 'gpt-6-luna'), null);
  assert.equal(delegatedModel(capabilities.codex.routing.delegation, 'gpt-6-luna'), 'gpt-6-luna');
  assert.equal(delegatedModel(capabilities.cursor.routing.delegation, 'claude-opus-5-5'), 'claude-opus-5-5');
});
