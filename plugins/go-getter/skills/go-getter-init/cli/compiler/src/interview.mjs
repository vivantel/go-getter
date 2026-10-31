// The interview's question logic as pure functions (decisions 0147, 0149, 0150, 0151): a pack plus an answers file in, the
// next question out. Nothing here reads or writes a file, so an interview resumes from its answers file and tests need no host.
import { CUSTOMISE, checkAnswer } from './packs.mjs';
import { renameAnswers } from './render.mjs';

// Keys an answers file may carry. A seed (decision 0149) keeps only `answers` and `profile`.
export const INPUT_KEYS = ['answers', 'profile', 'acceptedBy', 'detect', 'date'];

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The value at a dotted path of the detection result, or undefined when detection did not cover it.
export function detectedValue(detect, key) {
  if (!key) return undefined;
  let v = detect;
  for (const part of key.split('.')) {
    if (!isObject(v) || !(part in v)) return undefined;
    v = v[part];
  }
  return v === null || v === '' || (Array.isArray(v) && !v.length) ? undefined : v;
}

// What a question proposes: the recommended option, else the detected value, else the default. A list question with both
// proposes the detected items followed by the default items not already in it.
export function prefill(q, detect = {}) {
  const type = q.type ?? 'choice';
  if (type === 'choice') return q.options.find((o) => o.recommended)?.id;
  const found = detectedValue(detect, q.detect);
  if (type === 'text') return typeof found === 'string' ? found : q.default;
  const items = Array.isArray(found) && found.every((x) => typeof x === 'string') ? found : [];
  const rest = (q.default ?? []).filter((d) => !items.includes(d));
  return items.length || rest.length || q.default !== undefined ? [...items, ...rest] : undefined;
}

// The answer an advanced question takes when it is not asked (decision 0151): detected, else default, else recommended.
export const autoAnswer = prefill;

// Errors of an answers file against a pack. `strict` (a seed, `interview`) also refuses answers to questions the pack does not ask.
export function validateInput(pack, input, { strict = true } = {}) {
  const errors = [];
  if (!isObject(input)) return ['the answers file must be a JSON object'];
  const questions = new Map(pack.questions.map((q) => [q.id, q]));
  if (input.answers !== undefined && !isObject(input.answers)) errors.push('"answers" must be an object');
  for (const [id, a] of Object.entries(isObject(input.answers) ? renameAnswers(pack, input.answers) : {})) {
    const q = questions.get(id);
    if (!q) {
      if (strict) errors.push(`answers.${id}: pack "${pack.id}" has no such question`);
      continue;
    }
    try {
      checkAnswer(q, a);
    } catch (err) {
      errors.push(`answers.${id}: ${err.message}`);
    }
  }
  if (input.profile !== undefined && !isObject(input.profile)) errors.push('"profile" must be an object');
  for (const [topic, id] of Object.entries(isObject(input.profile) ? input.profile : {})) {
    const options = (pack.profiles ?? []).filter((p) => p.topic === topic);
    if (!options.length) errors.push(`profile.${topic}: pack "${pack.id}" has no such topic`);
    else if (id !== CUSTOMISE && !options.some((p) => p.id === id)) errors.push(`profile.${topic}: "${id}" is not a profile of this topic (${[...options.map((p) => p.id), CUSTOMISE].join(', ')})`);
  }
  return errors;
}

// A seed (decision 0149) is untrusted data: only `answers` and `profile` are used, unknown keys are refused, and what it
// says about the person (`acceptedBy`, `date`) or the project (`detect`) is dropped.
export function readSeed(pack, input) {
  if (!isObject(input)) throw new Error('the seed must be a JSON object');
  const unknown = Object.keys(input).filter((k) => !INPUT_KEYS.includes(k));
  const errors = [...unknown.map((k) => `"${k}" is not a key of an answers file`), ...validateInput(pack, input)];
  if (errors.length) throw new Error(`seed refused:\n  ${errors.join('\n  ')}`);
  return { answers: input.answers ?? {}, profile: input.profile ?? {} };
}

// Layers answers files, later ones winning: { answers, profile } merged key by key; the person-bound keys come from the last layer that has them.
export function mergeInputs(...layers) {
  const out = {};
  for (const layer of layers.filter(Boolean)) {
    out.answers = { ...out.answers, ...layer.answers };
    out.profile = { ...out.profile, ...layer.profile };
    for (const k of ['acceptedBy', 'detect', 'date']) if (layer[k] !== undefined) out[k] = layer[k];
  }
  return out;
}

const topicsOf = (pack) => [...new Set((pack.profiles ?? []).map((p) => p.topic))];

function profileAnswers(pack, profile = {}) {
  const out = {};
  for (const topic of topicsOf(pack)) {
    const chosen = (pack.profiles ?? []).find((p) => p.topic === topic && p.id === profile[topic]);
    if (chosen) for (const [qid, value] of Object.entries(chosen.answers)) out[qid] ??= { value, from: `profile ${topic}/${chosen.id}` };
  }
  return out;
}

// Walks the questions in order and settles each: answered (explicitly, by a chosen profile, by its advanced default, or
// by `since`), unresolved (to be asked), inactive (its `when` is not met) or blocked (its `when` waits on an unresolved question).
// Explicit answers win over a profile. Returns { answers, taken, status, ignored }; `taken` lists what was not asked.
export function resolveAnswers(pack, input, { advanced = false, sinceFallback = false } = {}) {
  const detect = input.detect ?? {};
  const explicit = renameAnswers(pack, input.answers ?? {});
  const fromProfile = profileAnswers(pack, input.profile);
  const answers = {};
  const status = {};
  const taken = [];
  const ignored = [];
  for (const q of pack.questions) {
    if (q.when) {
      const gate = status[q.when.question];
      if (gate === 'unresolved' || gate === 'blocked') {
        status[q.id] = 'blocked';
        continue;
      }
      if (gate !== 'answered' || ![].concat(answers[q.when.question]).some((a) => q.when.in.includes(a))) {
        status[q.id] = 'inactive';
        if (explicit[q.id] !== undefined) ignored.push(q.id);
        continue;
      }
    }
    let value = explicit[q.id];
    if (value === undefined && fromProfile[q.id]) {
      value = fromProfile[q.id].value;
      taken.push({ question: q.id, value, source: fromProfile[q.id].from });
    }
    if (value === undefined && q.tier === 'advanced' && !advanced) {
      value = autoAnswer(q, detect);
      if (value !== undefined) taken.push({ question: q.id, value, source: 'advanced default' });
    }
    if (value === undefined && sinceFallback && q.since) value = q.options ? q.options.find((o) => o.recommended).id : q.default;
    if (value === undefined) status[q.id] = 'unresolved';
    else {
      answers[q.id] = value;
      status[q.id] = 'answered';
    }
  }
  return { answers, taken, status, ignored };
}

// A question as the active agent renders it: no host, no host tool.
export function questionView(q, detect = {}) {
  return {
    id: q.id,
    type: q.type ?? 'choice',
    prompt: q.prompt,
    ...(q.tier ? { tier: q.tier } : {}),
    ...(q.multi ? { multi: true } : {}),
    ...(q.options ? { options: q.options.map((o) => ({ id: o.id, label: o.label, tradeoff: o.tradeoff, ...(o.recommended ? { recommended: true } : {}) })) } : {}),
    ...(q.pattern ? { pattern: q.pattern } : {}),
    prefill: prefill(q, detect),
  };
}

// The next thing to ask: a profile topic first, then the first unresolved question with the questions that can be asked
// with it (`batch`: no `when` on an unanswered question), or `done` with the complete answers.
export function nextQuestion(pack, input, { advanced = false } = {}) {
  const errors = validateInput(pack, input);
  if (errors.length) return { errors };
  const detect = input.detect ?? {};
  const explicit = input.answers ?? {};
  for (const topic of topicsOf(pack)) {
    if (input.profile?.[topic] !== undefined) continue;
    const profiles = pack.profiles.filter((p) => p.topic === topic);
    const covered = [...new Set(profiles.flatMap((p) => Object.keys(p.answers)))];
    if (covered.every((qid) => explicit[qid] !== undefined)) continue;
    return {
      done: false,
      kind: 'profile',
      topic,
      profiles: [
        ...profiles.map((p) => ({ id: p.id, label: p.label, tradeoff: p.tradeoff, ...(p.recommended ? { recommended: true } : {}), answers: p.answers })),
        { id: CUSTOMISE, label: 'Customise', tradeoff: 'Answer this topic\'s questions one by one.' },
      ],
      questions: covered,
    };
  }
  const { answers, taken, status, ignored } = resolveAnswers(pack, input, { advanced });
  const pending = pack.questions.filter((q) => status[q.id] === 'unresolved');
  if (!pending.length) return { done: true, answers, taken, ignored };
  const [first, ...later] = pending;
  return { done: false, kind: 'question', question: questionView(first, detect), batch: later.map((q) => questionView(q, detect)), taken };
}
