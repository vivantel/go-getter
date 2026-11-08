import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, loadPackSchema, validatePack, listPackFiles } from '../src/packs.mjs';
import { READ_ONLY_FUNCTIONS, NEVER_EXPOSED } from '../src/mcp-functions.mjs';
import { mcpRegistry } from '../src/mcp-registry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const schema = loadPackSchema(root);
const example = () => structuredClone(loadPack(path.join(here, 'fixtures/packs/example/pack.json')));
const tool = (over = {}) => ({
  name: 'plan_status',
  description: 'Plan status',
  function: 'plan-status',
  class: 'read',
  input: { plan: { type: 'id', description: 'plan id' }, state: { type: 'enum', values: ['open', 'done'] } },
  ...over,
});
const withTools = (...mcp) => Object.assign(example(), { mcp });
const errorsOf = (pack) => validatePack(schema, pack, { dirName: 'example' });

function project(adoptedPack) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-mcp-decl-'));
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  if (adoptedPack) {
    writeFileSync(
      path.join(dir, 'docs/decisions/0001-x.md'),
      `---\nid: 0001-x\ntitle: X\nstatus: active\ndate: 2026-11-05\ntags: [configuration]\ngo-getter:\n  generated-by: ${adoptedPack}@0.1.0\n---\n\nbody\n`,
    );
  }
  return dir;
}

test('a valid declaration passes; the mcp section is optional', () => {
  assert.deepEqual(errorsOf(example()), []);
  assert.deepEqual(errorsOf(withTools(tool())), []);
});

test('an invalid declaration is rejected with the field named', () => {
  const bad = [
    [{ name: 'Plan-Status' }, /\.name/],
    [{ class: 'admin' }, /\.class/],
    [{ description: undefined }, /missing required "description"/],
    [{ input: { plan: { type: 'string' } } }, /\.input\.plan\.type/],
    [{ input: { state: { type: 'enum' } } }, /enum input lists its values/],
    [{ input: { plan: { type: 'id', values: ['a'] } } }, /id input takes no values/],
    [{ extra: 1 }, /unknown property "extra"/],
  ];
  for (const [over, re] of bad) {
    const t = { ...tool(), ...over };
    for (const k of Object.keys(t)) if (t[k] === undefined) delete t[k];
    assert.ok(errorsOf(withTools(t)).some((e) => re.test(e)), JSON.stringify(over));
  }
  assert.ok(errorsOf(withTools(tool(), tool())).some((e) => /duplicate tool/.test(e)));
});

test('a declaration naming a writing verb or a function off the list is refused', () => {
  for (const fn of NEVER_EXPOSED) {
    const errs = errorsOf(withTools(tool({ function: fn })));
    assert.ok(errs.some((e) => /not a read-only function/.test(e)), fn);
  }
  assert.ok(errorsOf(withTools(tool({ function: 'made-up' }))).some((e) => /not a read-only function/.test(e)));
  assert.ok(errorsOf(withTools(tool({ function: 'run-start', class: 'read' }))).some((e) => /never exposed/.test(e)));
  assert.ok(errorsOf(withTools(tool({ function: 'refs', class: 'write' }))).length === 0, 'class write is in the format; the function list is the rule');
});

test('a path, glob or address input is refused', () => {
  for (const name of ['path', 'file', 'dir', 'glob', 'url', 'plan_path', 'target-file']) {
    const errs = errorsOf(withTools(tool({ input: { [name]: { type: 'id' } } })));
    assert.ok(errs.some((e) => /path, glob or address/.test(e)), name);
  }
  assert.ok(errorsOf(withTools(tool({ input: { kind: { type: 'enum', values: ['../etc'] } } }))).some((e) => /looks like a path/.test(e)));
  assert.ok(errorsOf(withTools(tool({ input: { p: { type: 'path' } } }))).length > 0);
});

test('the read-only list holds no never-exposed verb and no writing verb', () => {
  for (const fn of READ_ONLY_FUNCTIONS) {
    assert.ok(!NEVER_EXPOSED.includes(fn), fn);
    assert.doesNotMatch(fn, /^(run-(start|end|attempt)|approvals|secret|apply|update|remove|reconfigure|worktree|sandbox|tracker|plan-issue)/, fn);
    assert.doesNotMatch(fn, /(^|-)(start|end|add|allow|revoke|write|set|create|delete|push|merge|attempt)($|-)/, fn);
  }
  for (const must of ['run-start', 'run-end', 'approvals-add', 'approvals-allow', 'approvals-revoke', 'secret', 'run-attempt', 'apply', 'update', 'remove', 'reconfigure', 'worktree', 'sandbox']) {
    assert.ok(NEVER_EXPOSED.includes(must), must);
  }
  assert.equal(new Set(READ_ONLY_FUNCTIONS).size, READ_ONLY_FUNCTIONS.length);
});

test('every shipped pack validates and every shipped tool is class read on the list', () => {
  for (const file of listPackFiles(root)) {
    const pack = loadPack(file);
    for (const t of pack.mcp ?? []) {
      assert.equal(t.class, 'read', `${pack.id}.${t.name}`);
      assert.ok(READ_ONLY_FUNCTIONS.includes(t.function), `${pack.id}.${t.name}`);
    }
  }
});

test('the registry lists the tools of adopted packs only', () => {
  const packs = { example: withTools(tool()), other: { ...example(), id: 'other', mcp: [tool({ name: 'refs', function: 'refs' })] } };
  const adopted = project('example');
  const none = project(null);
  try {
    const { tools, errors } = mcpRegistry(adopted, root, packs);
    assert.deepEqual(errors, []);
    assert.deepEqual(tools.map((t) => t.name), ['plan_status']);
    assert.equal(tools[0].pack, 'example');
    assert.deepEqual(tools[0].inputSchema.properties.state, { type: 'string', enum: ['open', 'done'] });
    assert.equal(tools[0].inputSchema.additionalProperties, false);
    assert.deepEqual(mcpRegistry(none, root, packs).tools, [], 'absent when not adopted');
  } finally {
    rmSync(adopted, { recursive: true, force: true });
    rmSync(none, { recursive: true, force: true });
  }
});

test('two adopted packs declaring one tool name: the second is an error and not listed', () => {
  const packs = { example: withTools(tool()), other: { ...example(), id: 'other', mcp: [tool()] } };
  const dir = project('example');
  writeFileSync(path.join(dir, 'docs/decisions/0002-y.md'), `---\nid: 0002-y\ntitle: Y\nstatus: active\ndate: 2026-11-05\ntags: [configuration]\ngo-getter:\n  generated-by: other@0.1.0\n---\n\nb\n`);
  try {
    const { tools, errors } = mcpRegistry(dir, root, packs);
    assert.equal(tools.length, 1);
    assert.match(errors[0], /already declared by pack "example"/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
