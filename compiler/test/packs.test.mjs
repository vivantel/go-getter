import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadPack, loadPackSchema, validatePack, parseRun } from '../src/packs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const examplePath = path.join(here, 'fixtures/packs/example/pack.json');
const schema = loadPackSchema(root);
const example = () => structuredClone(loadPack(examplePath));

test('the example pack is valid', () => {
  assert.deepEqual(validatePack(schema, example(), { dirName: 'example' }), []);
  const out = execFileSync(process.execPath, [path.join(root, 'compiler/bin/go-getter.mjs'), 'check', 'packs', '--file', examplePath], { encoding: 'utf8' });
  assert.match(out, /ok \(1 pack\)/);
});

test('schema errors name the offending field', () => {
  const p = example();
  p.family = 'other';
  delete p.title;
  p.questions[0].options = [p.questions[0].options[0]];
  const errors = validatePack(schema, p);
  assert.ok(errors.some((e) => e.startsWith('$.family')));
  assert.ok(errors.some((e) => e.includes('missing required "title"')));
  assert.ok(errors.some((e) => e.startsWith('$.questions[0].options') && e.includes('>= 2')));
});

const cases = [
  ['id must match directory', (p) => p, 'other', /must equal its directory/],
  ['harness packs list components', (p) => { delete p.components; return p; }, 'example', /must list the components/],
  ['one recommended option', (p) => { p.questions[0].options[1].recommended = true; return p; }, 'example', /at most one option/],
  ['when refers to an earlier question', (p) => { p.questions[1].when.question = 'enforce-cap'; return p; }, 'example', /must be an earlier question/],
  ['outputs refer to real options', (p) => { p.outputs['instruction-cap'].medium = {}; return p; }, 'example', /"medium" is not an option/],
  ['tier 2+ needs run', (p) => { delete p.outputs['enforce-cap'].yes.guardrails[0].enforcement[0].run; return p; }, 'example', /tier 3 needs run/],
  ['guardrails need enforcement', (p) => { p.outputs['enforce-cap'].yes.guardrails[0].enforcement = []; return p; }, 'example', /need enforcement/],
  ['placeholders refer to questions', (p) => { p.outputs['instruction-cap'].strict.decisions[0].body = '{{answer.nope}}'; return p; }, 'example', /unknown question/],
  ['bad run arguments', (p) => { p.outputs['enforce-cap'].yes.guardrails[0].enforcement[0].run = 'builtin:file-max-lines AGENTS.md'; return p; }, 'example', /expected key=value/],
];
for (const [name, mutate, dirName, re] of cases) {
  test(`semantic rule: ${name}`, () => {
    const errors = validatePack(schema, mutate(example()), { dirName });
    assert.ok(errors.some((e) => re.test(e)), errors.join('\n'));
  });
}

test('run grammar distinguishes builtins from commands', () => {
  assert.deepEqual(parseRun('builtin:file-max-lines path=AGENTS.md max=200'), { kind: 'builtin', id: 'file-max-lines', args: { path: 'AGENTS.md', max: '200' } });
  assert.deepEqual(parseRun('builtin:commit-message pattern="^(feat|fix): .+"'), { kind: 'builtin', id: 'commit-message', args: { pattern: '^(feat|fix): .+' } });
  assert.deepEqual(parseRun('npm run check:deps'), { kind: 'command', command: 'npm run check:deps' });
});
