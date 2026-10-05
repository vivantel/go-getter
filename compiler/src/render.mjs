// Deterministic pack renderer (plan 4.3, decision 0022): pack + answers -> kms artifacts, INDEX rows, files.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { stringifyFrontmatter } from './frontmatter.mjs';
import { readTagVocabulary } from './artifacts.mjs';

const KIND_DIR = { decisions: 'decisions', facts: 'facts', guardrails: 'guardrails', procedures: 'skills' };
const NUMBERED = new Set(['decisions', 'facts']);
const INDEX_HEADER = { decisions: 'Decisions', facts: 'Facts', guardrails: 'Guardrails', skills: 'Skills' };

export function activeQuestions(pack, answers) {
  return pack.questions.filter((q) => {
    if (!q.when) return true;
    const prior = [].concat(answers[q.when.question] ?? []);
    return prior.some((a) => q.when.in.includes(a));
  });
}

function substitute(value, vars) {
  if (typeof value === 'string') {
    return value.replace(/\{\{\s*([a-z]+(?:\.[A-Za-z0-9_-]+)*)\s*\}\}/g, (whole, key) => {
      if (!(key in vars)) throw new Error(`placeholder ${whole} has no value`);
      return vars[key];
    });
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, vars));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, vars)]));
  return value;
}

function nextNumber(dir) {
  if (!existsSync(dir)) return 1;
  const nums = readdirSync(dir).map((n) => /^(\d{4})-/.exec(n)?.[1]).filter(Boolean).map(Number);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

const csv = (s) => `"${String(s).replace(/"/g, '""')}"`;

// Returns { artifacts: [{kind, id, path, content}], files: [{path, content}], newTags: [] } without touching disk.
export function planRender({ root, pack, answers, acceptedBy, date, detect = {} }) {
  const questions = activeQuestions(pack, answers);
  for (const q of questions) {
    const a = answers[q.id];
    if (a === undefined) throw new Error(`no answer for question "${q.id}"`);
    for (const opt of [].concat(a)) if (!q.options.some((o) => o.id === opt)) throw new Error(`answer "${opt}" is not an option of "${q.id}"`);
    if (!q.multi && Array.isArray(a)) throw new Error(`question "${q.id}" takes one answer`);
  }
  const vars = { 'pack.id': pack.id, 'pack.version': pack.version };
  for (const q of questions) {
    const chosen = [].concat(answers[q.id]);
    vars[`answer.${q.id}`] = chosen.join(', ');
    vars[`label.${q.id}`] = chosen.map((c) => q.options.find((o) => o.id === c).label).join(', ');
  }
  for (const [k, v] of Object.entries(detect)) vars[`detect.${k}`] = Array.isArray(v) ? v.join(', ') : String(v);

  const counters = {};
  const artifacts = [];
  const files = [];
  const usedTags = new Set();
  const generatedBy = `${pack.id}@${pack.version}`;

  for (const q of questions) {
    for (const option of [].concat(answers[q.id])) {
      const out = pack.outputs[q.id]?.[option] ?? {};
      // Decisions first so later templates in the same answer can reference {{id.decision.<q>}}.
      for (const kind of ['decisions', 'facts', 'guardrails', 'procedures']) {
        for (const tpl of out[kind] ?? []) {
          const dir = KIND_DIR[kind];
          let id = tpl.slug;
          if (NUMBERED.has(kind)) {
            counters[dir] ??= nextNumber(path.join(root, 'docs', dir));
            id = `${String(counters[dir]++).padStart(4, '0')}-${tpl.slug}`;
          }
          if (kind === 'decisions') vars[`id.decision.${q.id}`] ??= id;
          const rendered = substitute(tpl, vars);
          const data = { id, title: rendered.title, status: 'active', date, tags: rendered.tags, ...(rendered.frontmatter ?? {}) };
          if (kind === 'decisions') {
            if (!data.track) throw new Error(`decision template "${tpl.slug}" needs frontmatter.track`);
            if (!acceptedBy) throw new Error('acceptedBy is required to render active decisions');
            data['accepted-by'] = acceptedBy;
          }
          if (kind === 'facts' && !data.kind) throw new Error(`fact template "${tpl.slug}" needs frontmatter.kind`);
          if (kind === 'guardrails') {
            for (const f of ['governed-by', 'grounded-in', 'derivation-note']) if (!data[f]) throw new Error(`guardrail template "${tpl.slug}" needs frontmatter.${f}`);
          }
          data['go-getter'] = {
            ...(rendered.enforcement ? { enforcement: rendered.enforcement } : {}),
            'generated-by': generatedBy,
            'pack-answer': q.id,
          };
          rendered.tags.forEach((t) => usedTags.add(t));
          const rel = `docs/${dir}/${id}.md`;
          if (existsSync(path.join(root, rel))) throw new Error(`${rel} already exists (use reconfigure to change an adopted pack)`);
          artifacts.push({ kind: dir, id, title: rendered.title, tags: rendered.tags, path: rel, content: stringifyFrontmatter(data, `\n${rendered.body.trimEnd()}\n`) });
        }
      }
      for (const f of out.files ?? []) {
        const rel = path.normalize(substitute(f.path, vars));
        if (path.isAbsolute(rel) || rel.startsWith('..') || rel.startsWith(`docs${path.sep}`)) throw new Error(`file path "${f.path}" must stay inside the project and outside docs/`);
        files.push({ path: rel.split(path.sep).join('/'), content: substitute(f.content, vars) });
      }
    }
  }
  const vocabulary = readTagVocabulary(root);
  const newTags = vocabulary ? [...usedTags].filter((t) => !vocabulary.has(t)).sort() : [];
  return { artifacts, files, newTags, generatedBy };
}

export function applyRender({ root, plan }) {
  for (const a of plan.artifacts) {
    mkdirSync(path.join(root, path.dirname(a.path)), { recursive: true });
    writeFileSync(path.join(root, a.path), a.content);
    const index = path.join(root, 'docs', a.kind, 'INDEX.md');
    if (!existsSync(index)) writeFileSync(index, `# ${INDEX_HEADER[a.kind]} index (CSV)\n\nid,title,tags,status\n`);
    const body = readFileSync(index, 'utf8');
    appendFileSync(index, `${body.endsWith('\n') ? '' : '\n'}${a.id},${csv(a.title)},${csv(a.tags.join(', '))},active\n`);
  }
  if (plan.newTags.length) {
    const tagsFile = path.join(root, 'docs/skills/tags.md');
    const body = readFileSync(tagsFile, 'utf8');
    appendFileSync(tagsFile, `${body.endsWith('\n') ? '' : '\n'}${plan.newTags.map((t) => `${t} — introduced by go-getter pack ${plan.generatedBy}`).join('\n')}\n`);
  }
  for (const f of plan.files) {
    mkdirSync(path.dirname(path.join(root, f.path)), { recursive: true });
    writeFileSync(path.join(root, f.path), f.content);
  }
  return [...plan.artifacts.map((a) => a.path), ...plan.files.map((f) => f.path), ...(plan.newTags.length ? ['docs/skills/tags.md'] : [])];
}
