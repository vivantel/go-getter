import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOSTS, loadCapabilities, loadSchema, validateCapabilities } from '../src/capabilities.mjs';
import { validate } from '../src/schema.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('all seven host manifests exist and validate', () => {
  const caps = loadCapabilities(root);
  assert.deepEqual(Object.keys(caps).sort(), [...HOSTS].sort());
});

test('each manifest cites an existing fact', () => {
  for (const cap of Object.values(loadCapabilities(root))) {
    assert.ok(existsSync(path.join(root, 'docs/facts', `${cap.fact}.md`)), `${cap.host} cites ${cap.fact}`);
  }
});

test('manifests reflect key facts from 0009', () => {
  const caps = loadCapabilities(root);
  assert.equal(caps['claude-code'].instructions.agentsMdVia, 'symlink');
  assert.equal(caps['gemini-cli'].telemetry.logsPromptsByDefault, true);
  assert.equal(caps['gemini-cli'].nodeAtRuntime, true);
  assert.equal(caps.copilot.hooks.blockStop, false);
  assert.equal(caps.kilo.tiers['3'], 0);
  assert.equal(caps.opencode.tiers['3'], 0);
  assert.equal(caps.kilo.agents.dir, '.kilo/agents');
  assert.equal(caps.opencode.agents.dir, '.opencode/agents');
  for (const cap of Object.values(caps)) assert.equal(cap.agents.model, true, `${cap.host} supports per-agent model`);
});

test('invalid manifests are rejected with paths', () => {
  const schema = loadSchema(root);
  const errors = validateCapabilities(schema, { host: 'vim', extra: 1 });
  assert.ok(errors.some((e) => e.includes('$.host')));
  assert.ok(errors.some((e) => e.includes('missing required "tiers"')));
  assert.ok(errors.some((e) => e.includes('unknown property "extra"')));
});

test('schema validator handles types, enums, patterns and nested items', () => {
  const schema = {
    type: 'object',
    required: ['a'],
    properties: { a: { type: 'array', items: { type: 'integer', minimum: 1 } }, b: { enum: ['x'] }, c: { type: 'string', pattern: '^z' } },
    additionalProperties: false,
  };
  assert.deepEqual(validate(schema, { a: [1, 2] }), []);
  assert.equal(validate(schema, { a: [0], b: 'y', c: 'q' }).length, 3);
});

test('permissions.ask needs a file and a known format', () => {
  const schema = loadSchema(root);
  const base = structuredClone(loadCapabilities(root).kilo);
  assert.deepEqual(validateCapabilities(schema, base), []);
  base.permissions.ask = { format: 'opencode-permission' };
  assert.ok(validateCapabilities(schema, base).some((e) => e.includes('missing required "file"')));
  base.permissions.ask = { file: 'kilo.json', format: 'toml' };
  assert.ok(validateCapabilities(schema, base).some((e) => e.includes('must be one of')));
});
