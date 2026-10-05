#!/usr/bin/env node
// promptfoo `exec:` provider: runs one case of the deterministic init flow with scripted answers (recommended
// defaults, as the interview offers them) against a fresh copy of a fixture repo. No model and no API key.
//
// Invoked by promptfoo as: init-runner.mjs <prompt> <options-json> <context-json>. Case config travels in the
// test's vars (strings, so promptfoo does not expand them into permutations): fixture, packs ("all" or a comma
// list), hosts (comma list), mode ("init" | "routing"); routing also takes host, sessionModel, tasks (a JSON list).
// Prints one JSON document to stdout; a failure is folded into it (`error`) so a broken case fails an assertion
// instead of crashing the run.
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from '../../compiler/src/frontmatter.mjs';
import { loadPack } from '../../compiler/src/packs.mjs';
import { detect } from '../../compiler/src/detect.mjs';
import { HOST_TERMS } from '../../compiler/src/checks/neutral.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');
const KINDS = ['facts', 'decisions', 'guardrails', 'skills'];
const REQUIRED = ['id', 'title', 'status', 'date', 'tags'];

const gg = (project, args) => execFileSync('node', [cli, ...args], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const ggStatus = (project, args) => {
  try {
    return { code: 0, out: gg(project, args) };
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
};
const listFiles = (dir, rel = '') =>
  readdirSync(path.join(dir, rel)).flatMap((n) => {
    if (n === '.git' || n === 'node_modules') return [];
    const r = rel ? `${rel}/${n}` : n;
    return statSync(path.join(dir, r)).isDirectory() ? listFiles(dir, r) : [r];
  });

// Scratch project (+ a sibling directory for the answers files): fixture copy, git repo, and the model-price facts
// and tag list the packs build on.
function scratch(fixture) {
  const base = mkdtempSync(path.join(tmpdir(), 'gg-eval-'));
  const dir = path.join(base, 'project');
  const src = path.join(root, 'evals/fixtures', fixture);
  if (!existsSync(src)) throw new Error(`no fixture "${fixture}"`);
  cpSync(src, dir, { recursive: true });
  const setup = path.join(dir, 'setup.sh');
  if (existsSync(setup)) {
    execFileSync('sh', [setup], { cwd: dir });
    rmSync(setup);
  }
  mkdirSync(path.join(dir, 'docs/skills'), { recursive: true });
  mkdirSync(path.join(dir, 'docs/facts'), { recursive: true });
  cpSync(path.join(root, 'docs/skills/tags.md'), path.join(dir, 'docs/skills/tags.md'));
  const seeded = /^(001[1-4]|0024)-/;
  for (const f of readdirSync(path.join(root, 'docs/facts')).filter((n) => seeded.test(n))) {
    cpSync(path.join(root, 'docs/facts', f), path.join(dir, 'docs/facts', f));
  }
  const index = readFileSync(path.join(root, 'docs/facts/INDEX.md'), 'utf8').split('\n');
  writeFileSync(path.join(dir, 'docs/facts/INDEX.md'), [index[0], ...index.slice(1).filter((l) => seeded.test(l))].join('\n') + '\n');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  const answersDir = path.join(base, 'answers');
  mkdirSync(answersDir);
  return { base, dir, answersDir };
}

const get = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

// The scripted answers: the detected value where the question has one, else the recommended option or the default.
function answersFor(pack, facts) {
  const answers = {};
  for (const q of pack.questions) {
    if (q.when && !(q.when.in ?? []).includes(answers[q.when.question])) continue;
    if (q.options) {
      answers[q.id] = q.options.find((o) => o.recommended).id;
      continue;
    }
    const detected = q.detect ? get(facts, q.detect) : undefined;
    if (q.type === 'list') {
      const found = Array.isArray(detected) ? detected : [];
      answers[q.id] = [...found, ...(Array.isArray(q.default) ? q.default.filter((x) => !found.includes(x)) : [])];
    } else answers[q.id] = typeof detected === 'string' && detected ? detected : q.default;
  }
  return answers;
}

// Packs after the packs they require.
function order(packs) {
  const done = [];
  const visit = (p) => {
    if (done.some((d) => d.id === p.id)) return;
    for (const r of p.requires ?? []) {
      const dep = packs.find((x) => x.id === r);
      if (dep) visit(dep);
    }
    done.push(p);
  };
  packs.forEach(visit);
  return done;
}

function knowledgeBaseProblems(dir) {
  const problems = [];
  const tags = new Set(
    readFileSync(path.join(dir, 'docs/skills/tags.md'), 'utf8')
      .split('\n')
      .map((l) => /^([a-z0-9-]+)\s+—/.exec(l)?.[1])
      .filter(Boolean),
  );
  for (const kind of KINDS) {
    const kdir = path.join(dir, 'docs', kind);
    if (!existsSync(kdir)) continue;
    const index = existsSync(path.join(kdir, 'INDEX.md')) ? readFileSync(path.join(kdir, 'INDEX.md'), 'utf8') : '';
    const rows = new Set(index.split('\n').map((l) => l.split(',')[0]));
    for (const f of readdirSync(kdir).filter((n) => n.endsWith('.md') && n !== 'INDEX.md' && n !== 'tags.md')) {
      const where = `docs/${kind}/${f}`;
      let fm;
      try {
        fm = parseFrontmatter(readFileSync(path.join(kdir, f), 'utf8')).data;
      } catch (err) {
        problems.push(`${where}: frontmatter does not parse (${err.message})`);
        continue;
      }
      for (const k of REQUIRED) if (fm?.[k] === undefined) problems.push(`${where}: missing "${k}"`);
      for (const t of fm?.tags ?? []) if (!tags.has(t)) problems.push(`${where}: tag "${t}" is not in docs/skills/tags.md`);
      if (fm?.id && !rows.has(fm.id)) problems.push(`${where}: no INDEX row for "${fm.id}"`);
      if (kind === 'guardrails' && !fm?.['go-getter']?.enforcement) problems.push(`${where}: no go-getter.enforcement`);
    }
  }
  return problems;
}

// Generated knowledge artifacts are neutral text: they must not name a host agent.
function hostLeaks(dir, files) {
  const leaks = [];
  for (const f of files.filter((x) => /^docs\/(decisions|guardrails)\/(?!INDEX)/.test(x))) {
    readFileSync(path.join(dir, f), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (HOST_TERMS.some((re) => re.test(line))) leaks.push(`${f}:${i + 1}`);
      });
  }
  return leaks;
}

// Every detected sensitive path must appear in the restricted-paths guardrail's enforcement.
function uncovered(dir, sensitive) {
  const file = path.join(dir, 'docs/guardrails/restricted-paths-denied.md');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : null;
  return text === null ? sensitive : sensitive.filter((p) => !text.includes(p));
}

function runInit(cfg) {
  const { base, dir, answersDir } = scratch(cfg.fixture);
  try {
    const facts = detect(dir);
    const all = readdirSync(path.join(root, 'src/packs')).map((id) => loadPack(path.join(root, 'src/packs', id, 'pack.json')));
    const chosen = order(cfg.packs === 'all' ? all : all.filter((p) => cfg.packs.includes(p.id)));
    const before = new Set(listFiles(dir));
    const rendered = [];
    for (const pack of chosen) {
      const file = path.join(answersDir, `${pack.id}.json`);
      writeFileSync(file, JSON.stringify({ answers: answersFor(pack, facts), acceptedBy: 'eval', date: '2026-10-05', detect: facts }));
      const r = ggStatus(dir, ['render-pack', pack.id, '--answers', file, '--project', dir]);
      rendered.push({ pack: pack.id, code: r.code, ...(r.code ? { out: r.out } : {}) });
    }
    const hosts = cfg.hosts.join(',');
    const apply = ggStatus(dir, ['apply', '--project', dir, '--hosts', hosts]);
    const applyCheck = ggStatus(dir, ['apply', '--project', dir, '--hosts', hosts, '--check']);
    const check = ggStatus(dir, ['check', '--project', dir]);
    const files = listFiles(dir);
    return {
      mode: 'init',
      fixture: cfg.fixture,
      detected: { sensitivePaths: facts.sensitivePaths },
      rendered,
      apply: { code: apply.code, out: apply.code ? apply.out : undefined },
      applyCheck: { code: applyCheck.code },
      check: { code: check.code, out: check.code ? check.out : undefined },
      created: files.filter((f) => !before.has(f)),
      knowledgeBaseProblems: knowledgeBaseProblems(dir),
      hostLeaks: hostLeaks(dir, files),
      uncoveredSensitivePaths: uncovered(dir, facts.sensitivePaths ?? []),
    };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

// The same fixed tasks with routing off (always the session model) and on (the router's cheapest eligible route).
// Both face the same verification gate, failure rates and bounded escalation, so each expected cost already
// includes the price of retrying a failed step: the pass rate is equal by construction.
function runRouting(cfg) {
  const { base, dir, answersDir } = scratch(cfg.fixture);
  try {
    const facts = detect(dir);
    const pack = loadPack(path.join(root, 'src/packs/cost-routing/pack.json'));
    const file = path.join(answersDir, 'cost-routing.json');
    writeFileSync(file, JSON.stringify({ answers: answersFor(pack, facts), acceptedBy: 'eval', date: '2026-10-05' }));
    const render = ggStatus(dir, ['render-pack', 'cost-routing', '--answers', file, '--project', dir]);
    if (render.code) throw new Error(`render-pack cost-routing: ${render.out}`);
    const tasks = cfg.tasks.map((t) => {
      const route = JSON.parse(
        gg(dir, ['route', '--class', t.class, '--context-tokens', String(t.contextTokens), '--cache', t.cache, '--session-model', cfg.sessionModel, '--host', cfg.host, '--project', dir]),
      );
      const off = route.options.find((o) => o.action === 'stay');
      return { ...t, on: { action: route.action, model: route.model, expectedCost: route.expectedCost }, off: off ? { model: off.model, expectedCost: off.expectedCost } : null };
    });
    const sum = (k) => tasks.reduce((s, t) => s + (t[k]?.expectedCost ?? Number.NaN), 0);
    return { mode: 'routing', tasks, total: { on: sum('on'), off: sum('off') } };
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
}

let cfg = {};
try {
  const vars = JSON.parse(process.argv[4] || '{}').vars ?? {};
  const list = (v) => (v === 'all' ? 'all' : String(v ?? '').split(',').filter(Boolean));
  cfg = { ...vars, packs: list(vars.packs), hosts: list(vars.hosts), ...(vars.tasks ? { tasks: JSON.parse(vars.tasks) } : {}) };
  console.log(JSON.stringify(cfg.mode === 'routing' ? runRouting(cfg) : runInit(cfg), null, 2));
} catch (err) {
  console.log(JSON.stringify({ error: String(err.message ?? err), config: cfg }, null, 2));
}
