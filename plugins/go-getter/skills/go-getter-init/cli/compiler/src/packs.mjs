// Practice packs (decisions 0008, 0022): loading, schema + semantic validation, enforcement `run` grammar.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { validate } from './schema.mjs';

// Outputs of a text/list question sit under this key and apply whatever the answer is.
export const ANY_ANSWER = '*';

// Packs whose answers set how data, secrets or gated commands are handled: their questions are always asked (decision 0151).
// The interview's answer that opens a topic's questions one by one instead of choosing a profile.
export const CUSTOMISE = 'customise';

export const ALWAYS_BASIC_PACKS = new Set(['hitl', 'restricted-data', 'data-policy', 'sanitization']);

// Throws when `a` is not a valid answer to question `q` (option ids, type, pattern).
export function checkAnswer(q, a) {
  const type = q.type ?? 'choice';
  if (type === 'choice') {
    for (const opt of [].concat(a)) if (!q.options.some((o) => o.id === opt)) throw new Error(`answer "${opt}" is not an option of "${q.id}"`);
    if (!q.multi && Array.isArray(a)) throw new Error(`question "${q.id}" takes one answer`);
    return;
  }
  if (type === 'text' ? typeof a !== 'string' : !Array.isArray(a) || a.some((x) => typeof x !== 'string')) {
    throw new Error(`question "${q.id}" takes ${type === 'text' ? 'a string' : 'an array of strings'}`);
  }
  if (q.pattern) {
    const re = new RegExp(q.pattern);
    for (const item of [].concat(a)) if (!re.test(item)) throw new Error(`answer "${item}" does not match the pattern of "${q.id}" (${q.pattern})`);
  }
}

const compareVersions = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};
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
  if (pack.replaces) {
    const own = new Set(pack.questions.map((q) => q.id));
    if (pack.replaces.pack === pack.id) errors.push('$.replaces.pack: a pack cannot replace itself');
    for (const q of pack.replaces.questions) if (!own.has(q)) errors.push(`$.replaces.questions: "${q}" is not a question of this pack`);
  }
  for (const r of pack.requires ?? []) if (knownPacks && !knownPacks.has(r)) errors.push(`$.requires: unknown pack "${r}"`);

  const questions = new Map();
  pack.questions.forEach((q, i) => {
    const at = `$.questions[${i}]`;
    if (questions.has(q.id)) errors.push(`${at}.id: duplicate question "${q.id}"`);
    const type = q.type ?? 'choice';
    if (type === 'choice') {
      if (!q.options) errors.push(`${at}.options: choice questions need options`);
      else {
        const optionIds = q.options.map((o) => o.id);
        if (new Set(optionIds).size !== optionIds.length) errors.push(`${at}.options: duplicate option ids`);
        if (q.options.filter((o) => o.recommended).length !== 1) errors.push(`${at}.options: exactly one option must be recommended`);
      }
      const current = (q.options ?? []).map((o) => o.id);
      for (const [oldId, newId] of Object.entries(q.renamed ?? {})) {
        if (current.includes(oldId)) errors.push(`${at}.renamed.${oldId}: "${oldId}" is still an option of "${q.id}"`);
        if (!current.includes(newId)) errors.push(`${at}.renamed.${oldId}: "${newId}" is not an option of "${q.id}"`);
      }
      for (const k of ['pattern', 'default']) if (q[k] !== undefined) errors.push(`${at}.${k}: only text and list questions take "${k}"`);
    } else {
      if (q.renamed) errors.push(`${at}.renamed: only choice questions rename options`);
      if (q.options) errors.push(`${at}.options: ${type} questions take no options`);
      if (q.default === undefined && !q.detect) errors.push(`${at}: ${type} questions need a default or a detect key`);
      if (type === 'text' && Array.isArray(q.default)) errors.push(`${at}.default: text questions take a string default`);
      if (type === 'list' && q.default !== undefined && !Array.isArray(q.default)) errors.push(`${at}.default: list questions take an array default`);
      if (q.pattern) {
        try {
          const re = new RegExp(q.pattern);
          for (const d of [].concat(q.default ?? [])) if (!re.test(d)) errors.push(`${at}.default: "${d}" does not match pattern`);
        } catch {
          errors.push(`${at}.pattern: not a valid regular expression`);
        }
      }
    }
    if (q.since) {
      if (compareVersions(q.since, pack.version) > 0) errors.push(`${at}.since: "${q.since}" is later than the pack version ${pack.version}`);
      if (type !== 'choice' && q.default === undefined) errors.push(`${at}: a question with "since" needs a default for older answer files`);
    }
    if (q.when) {
      const prior = questions.get(q.when.question);
      if (!prior) errors.push(`${at}.when.question: "${q.when.question}" must be an earlier question`);
      else if (prior.options) {
        for (const o of q.when.in) if (!prior.options.some((p) => p.id === o)) errors.push(`${at}.when.in: "${o}" is not an option of "${q.when.question}"`);
      }
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
      if (q.options ? !q.options.some((o) => o.id === oid) : oid !== ANY_ANSWER) {
        errors.push(q.options ? `${at}: "${oid}" is not an option of "${qid}"` : `${at}: ${q.type} questions use the key "${ANY_ANSWER}"`);
      }
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

  validateTiers(pack, questions, errors);
  validateProfiles(pack, questions, errors);

  for (const { ns, parts } of placeholdersIn(pack.outputs)) {
    const label = `{{${[ns, ...parts].join('.')}}}`;
    if ((ns === 'answer' || ns === 'label') && !questions.has(parts[0])) errors.push(`placeholder ${label}: unknown question`);
    else if (ns === 'label' && !questions.get(parts[0]).options) errors.push(`placeholder ${label}: only choice questions have labels`);
    else if (ns === 'id' && (parts[0] !== 'decision' || !questions.has(parts[1]))) errors.push(`placeholder ${label}: expected {{id.decision.<question>}}`);
    else if (ns === 'pack' && !['id', 'version'].includes(parts[0])) errors.push(`placeholder ${label}: expected pack.id or pack.version`);
    else if (!['answer', 'label', 'id', 'pack', 'detect'].includes(ns)) errors.push(`placeholder ${label}: unknown namespace`);
  }
  return errors;
}

// Decision 0151 item 5: a question that cannot be answered by its default, that changes which guardrails a pack produces, or
// that sets how data, secrets or gated commands are handled is basic whatever its author declares.
function validateTiers(pack, questions, errors) {
  pack.questions.forEach((q, i) => {
    if (q.tier !== 'advanced') return;
    const at = `$.questions[${i}].tier`;
    if (ALWAYS_BASIC_PACKS.has(pack.id)) errors.push(`${at}: questions of pack "${pack.id}" set how data, secrets or gated commands are handled and stay basic`);
    if (q.options) {
      const signature = (o) => JSON.stringify((pack.outputs[q.id]?.[o.id]?.guardrails ?? []).map((g) => [g.slug, g.enforcement]));
      if (new Set(q.options.map(signature)).size > 1) errors.push(`${at}: "${q.id}" changes which guardrails the pack produces, so it stays basic`);
    } else if (q.default === undefined) errors.push(`${at}: "${q.id}" has no default, so it stays basic`);
  });
}

// Decision 0150: profiles are alternatives per topic, each answering questions of this pack with valid answers.
function validateProfiles(pack, questions, errors) {
  const seen = new Set();
  const topicOf = new Map();
  const recommended = new Map();
  (pack.profiles ?? []).forEach((p, i) => {
    const at = `$.profiles[${i}]`;
    if (seen.has(`${p.topic}/${p.id}`)) errors.push(`${at}.id: duplicate profile "${p.id}" in topic "${p.topic}"`);
    seen.add(`${p.topic}/${p.id}`);
    if (!Object.keys(p.answers).length) errors.push(`${at}.answers: a profile answers at least one question`);
    if (p.id === CUSTOMISE) errors.push(`${at}.id: "${CUSTOMISE}" is reserved`);
    if (p.recommended) {
      if (recommended.has(p.topic)) errors.push(`${at}.recommended: topic "${p.topic}" already has a recommended profile`);
      recommended.set(p.topic, p.id);
    }
    for (const [qid, a] of Object.entries(p.answers)) {
      const q = questions.get(qid);
      if (!q) {
        errors.push(`${at}.answers.${qid}: no such question`);
        continue;
      }
      if (topicOf.has(qid) && topicOf.get(qid) !== p.topic) errors.push(`${at}.answers.${qid}: question is already covered by topic "${topicOf.get(qid)}"`);
      topicOf.set(qid, p.topic);
      try {
        checkAnswer(q, a);
      } catch (err) {
        errors.push(`${at}.answers.${qid}: ${err.message}`);
      }
    }
  });
}

export function validateAllPacks(root, files = listPackFiles(root)) {
  const schema = loadPackSchema(root);
  const packs = files.map((f) => ({ file: f, pack: loadPack(f) }));
  const knownPacks = new Set(packs.map((p) => p.pack.id));
  return packs.flatMap(({ file, pack }) =>
    validatePack(schema, pack, { dirName: path.basename(path.dirname(file)), knownPacks }).map((e) => `${path.relative(root, file)}: ${e}`),
  );
}

// The packs that took over a retired pack (`replaces`, decision 0132): ids, for a message that says where it went.
export function successorsOf(root, retiredId) {
  return listPackFiles(root).map((file) => loadPack(file)).filter((p) => p.replaces?.pack === retiredId).map((p) => p.id);
}

// "<id> was split into a, b and c; ..." when `id` is a retired pack, else null.
export function retiredPackNote(root, id) {
  const now = id ? successorsOf(root, id) : [];
  return now.length ? `pack "${id}" was split into ${now.join(', ')}; run this command for each with the same answers file (answers a pack does not ask are ignored)` : null;
}
