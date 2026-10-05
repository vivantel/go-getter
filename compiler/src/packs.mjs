// Practice packs (decisions 0008, 0022): loading, schema + semantic validation, enforcement `run` grammar.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { validate } from './schema.mjs';

const PLACEHOLDER = /\{\{\s*([a-z]+)((?:\.[A-Za-z0-9_-]+)*)\s*\}\}/g;

export function loadPackSchema(root) {
  return JSON.parse(readFileSync(path.join(root, 'compiler/schemas/pack.schema.json'), 'utf8'));
}

export function loadPack(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function listPackFiles(root) {
  const dir = path.join(root, 'src/packs');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => statSync(path.join(dir, n)).isDirectory())
    .sort()
    .map((n) => path.join(dir, n, 'pack.json'));
}

// "builtin:<id> key=value key=\"quoted value\"" or a shell command.
export function parseRun(run) {
  if (!run.startsWith('builtin:')) return { kind: 'command', command: run };
  const [head, ...rest] = run.slice('builtin:'.length).match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
  if (!head || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(head)) throw new Error(`invalid builtin check id in "${run}"`);
  const args = {};
  for (const token of rest) {
    const m = /^([a-zA-Z0-9_-]+)=(.*)$/.exec(token);
    if (!m) throw new Error(`invalid argument "${token}" in "${run}" (expected key=value)`);
    args[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
  return { kind: 'builtin', id: head, args };
}

function placeholdersIn(value, found = []) {
  if (typeof value === 'string') for (const m of value.matchAll(PLACEHOLDER)) found.push({ ns: m[1], parts: m[2].split('.').filter(Boolean) });
  else if (Array.isArray(value)) value.forEach((v) => placeholdersIn(v, found));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => placeholdersIn(v, found));
  return found;
}

export function validatePack(schema, pack, { dirName, knownPacks } = {}) {
  const errors = validate(schema, pack);
  if (errors.length) return errors;
  if (dirName && pack.id !== dirName) errors.push(`$.id: "${pack.id}" must equal its directory "${dirName}"`);
  if (pack.family === 'harness' && !pack.components?.length) errors.push('$.components: harness packs must list the components they cover');
  for (const r of pack.requires ?? []) if (knownPacks && !knownPacks.has(r)) errors.push(`$.requires: unknown pack "${r}"`);

  const questions = new Map();
  pack.questions.forEach((q, i) => {
    const at = `$.questions[${i}]`;
    if (questions.has(q.id)) errors.push(`${at}.id: duplicate question "${q.id}"`);
    const optionIds = q.options.map((o) => o.id);
    if (new Set(optionIds).size !== optionIds.length) errors.push(`${at}.options: duplicate option ids`);
    if (q.options.filter((o) => o.recommended).length > 1) errors.push(`${at}.options: at most one option may be recommended`);
    if (q.when) {
      const prior = questions.get(q.when.question);
      if (!prior) errors.push(`${at}.when.question: "${q.when.question}" must be an earlier question`);
      else for (const o of q.when.in) if (!prior.options.some((p) => p.id === o)) errors.push(`${at}.when.in: "${o}" is not an option of "${q.when.question}"`);
    }
    questions.set(q.id, q);
  });

  for (const [qid, byOption] of Object.entries(pack.outputs)) {
    const q = questions.get(qid);
    if (!q) {
      errors.push(`$.outputs.${qid}: no such question`);
      continue;
    }
    for (const [oid, out] of Object.entries(byOption)) {
      const at = `$.outputs.${qid}.${oid}`;
      if (!q.options.some((o) => o.id === oid)) errors.push(`${at}: "${oid}" is not an option of "${qid}"`);
      (out.guardrails ?? []).forEach((g, i) => {
        if (!g.enforcement?.length) errors.push(`${at}.guardrails[${i}]: guardrails need enforcement entries`);
        (g.enforcement ?? []).forEach((e, j) => {
          if (e.tier >= 2 && !e.run) errors.push(`${at}.guardrails[${i}].enforcement[${j}]: tier ${e.tier} needs run`);
          if (e.run) {
            try {
              parseRun(e.run);
            } catch (err) {
              errors.push(`${at}.guardrails[${i}].enforcement[${j}].run: ${err.message}`);
            }
          }
        });
      });
    }
  }

  for (const { ns, parts } of placeholdersIn(pack.outputs)) {
    const label = `{{${[ns, ...parts].join('.')}}}`;
    if ((ns === 'answer' || ns === 'label') && !questions.has(parts[0])) errors.push(`placeholder ${label}: unknown question`);
    else if (ns === 'id' && (parts[0] !== 'decision' || !questions.has(parts[1]))) errors.push(`placeholder ${label}: expected {{id.decision.<question>}}`);
    else if (ns === 'pack' && !['id', 'version'].includes(parts[0])) errors.push(`placeholder ${label}: expected pack.id or pack.version`);
    else if (!['answer', 'label', 'id', 'pack', 'detect'].includes(ns)) errors.push(`placeholder ${label}: unknown namespace`);
  }
  return errors;
}

export function validateAllPacks(root, files = listPackFiles(root)) {
  const schema = loadPackSchema(root);
  const packs = files.map((f) => ({ file: f, pack: loadPack(f) }));
  const knownPacks = new Set(packs.map((p) => p.pack.id));
  return packs.flatMap(({ file, pack }) =>
    validatePack(schema, pack, { dirName: path.basename(path.dirname(file)), knownPacks }).map((e) => `${path.relative(root, file)}: ${e}`),
  );
}
