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
  ['at most one recommended option', (p) => { p.questions[0].options[1].recommended = true; return p; }, 'example', /exactly one option must be recommended/],
  ['at least one recommended option', (p) => { delete p.questions[0].options[0].recommended; return p; }, 'example', /exactly one option must be recommended/],
  ['choice questions need options', (p) => { delete p.questions[0].options; return p; }, 'example', /choice questions need options/],
  ['text questions take no options', (p) => { Object.assign(p.questions[0], { type: 'text', default: 'x' }); return p; }, 'example', /text questions take no options/],
  ['text questions need a default or detect', (p) => { p.questions.push({ id: 'cmd', type: 'text', prompt: 'Command?' }); return p; }, 'example', /need a default or a detect key/],
  ['list defaults are arrays', (p) => { p.questions.push({ id: 'paths', type: 'list', prompt: 'Paths?', default: 'a' }); return p; }, 'example', /list questions take an array default/],
  ['defaults must match the pattern', (p) => { p.questions.push({ id: 'cmd', type: 'text', prompt: 'Command?', pattern: '^npm ', default: 'make' }); return p; }, 'example', /does not match pattern/],
  ['choice questions take no pattern', (p) => { p.questions[0].pattern = 'x'; return p; }, 'example', /only text and list questions take "pattern"/],
  ['text outputs use the any-answer key', (p) => { p.questions.push({ id: 'cmd', type: 'text', prompt: 'Command?', default: 'x' }); p.outputs.cmd = { x: {} }; return p; }, 'example', /use the key "\*"/],
  ['labels exist only for choice questions', (p) => { p.questions.push({ id: 'cmd', type: 'text', prompt: 'Command?', default: 'x' }); p.outputs['instruction-cap'].strict.decisions[0].body = '{{label.cmd}}'; return p; }, 'example', /only choice questions have labels/],
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

test('text and list questions validate with defaults or detect keys and "*" outputs', () => {
  const p = example();
  p.questions.push({ id: 'check', type: 'text', prompt: 'Which command?', detect: 'commands.test', pattern: '^\\S' });
  p.questions.push({ id: 'paths', type: 'list', prompt: 'Which paths?', default: ['docs/'] });
  p.questions.push({ id: 'when-text', type: 'text', prompt: 'Why?', default: 'a', when: { question: 'check', in: ['npm test'] } });
  p.outputs.check = { '*': { facts: [{ slug: 'check-command', title: 'Check: {{answer.check}}', tags: ['configuration'], frontmatter: { kind: 'x' }, body: '{{answer.paths}} {{detect.commands.test}}' }] } };
  assert.deepEqual(validatePack(schema, p, { dirName: 'example' }), []);
});

test('a question added in a later version needs a fallback and a version no later than the pack', () => {
  const p = example();
  p.questions.push({ id: 'added', type: 'text', prompt: 'Which?', detect: 'commands.test', since: '0.1.0' });
  p.questions.push({ id: 'future', type: 'text', prompt: 'Which?', default: '', since: '9.0.0' });
  p.outputs.added = { '*': {} };
  p.outputs.future = { '*': {} };
  const errors = validatePack(schema, p, { dirName: 'example' });
  assert.ok(errors.some((e) => e.includes('needs a default for older answer files')), errors.join('\n'));
  assert.ok(errors.some((e) => e.includes('"9.0.0" is later than the pack version')), errors.join('\n'));
});
