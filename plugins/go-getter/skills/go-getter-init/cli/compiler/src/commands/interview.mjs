// go-getter interview next|validate <pack-id> [--answers <file>] [--answers-from <file>] [--current] [--advanced] [--project <dir>] [--pack-file <file>]
// The interview's question logic (decision 0147): a pure function of the pack and the answers, printed as JSON for the
// active agent to render. It writes nothing. --current starts from the answers recorded in the project's artifacts
// (so an update gap is asked alone); --answers-from seeds from another answers file as untrusted data (decision 0149).
// `next --defaults` (decision 0155) runs the rest of the pack unattended: it takes each recommended option, writes the answers
// file and a draft decision per answer, and stops (exit 3) on a trigger. --risk <file> names per-question risks, --budget and
// --spent bound spend in USD.
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadPack, loadPackSchema, validatePack } from '../packs.mjs';
import { mergeInputs, nextQuestion, readSeed, validateInput } from '../interview.mjs';
import { adoptedArtifacts, currentAnswers } from '../reconfigure.mjs';
import { renameAnswers } from '../render.mjs';
import { runDefaults } from '../defaults.mjs';
import { readLog, summarize } from '../telemetry/record.mjs';

const USAGE = 'usage: go-getter interview next|validate <pack-id> [--answers <file>] [--answers-from <file>] [--current] [--advanced] [--defaults [--risk <file>] [--budget <usd>] [--spent <usd>]] [--project <dir>]';

const readJson = (file) => JSON.parse(readFileSync(path.resolve(file), 'utf8'));

function defaultsRun(pack, input, opts) {
  if (!opts.answers) throw new Error('--defaults needs --answers <file> to record the answers in');
  for (const k of ['budget', 'spent']) if (k in opts && !(opts[k] >= 0)) throw new Error(`--${k} must be a number of USD`);
  const adopted = adoptedArtifacts(opts.project, pack.id);
  const run = runDefaults({
    project: opts.project,
    pack,
    input,
    advanced: opts.advanced,
    risk: opts.risk ? readJson(opts.risk) : {},
    committed: adopted.length ? renameAnswers(pack, currentAnswers(adopted)) : null,
    budgetUsd: opts.budget ?? null,
    spentUsd: opts.spent ?? summarize(readLog(opts.project)).cost,
  });
  const file = path.resolve(opts.answers);
  const saved = existsSync(file) ? readJson(file) : {};
  writeFileSync(file, `${JSON.stringify({ ...saved, answers: run.input.answers, profile: run.input.profile }, null, 2)}\n`);
  const { stopped, defaulted, done } = run;
  console.log(JSON.stringify({ done, defaulted, ...(stopped ? { stopped } : {}) }, null, 2));
  if (stopped) console.error(`interview: stopped at "${stopped.question}": ${stopped.triggers.map((t) => `${t.trigger} (${t.reason})`).join('; ')}`);
  return stopped ? 3 : 0;
}

export default function interviewCommand({ root, args }) {
  const [verb, ...rest] = args;
  const opts = { project: process.cwd() };
  let id;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--answers') opts.answers = rest[++i];
    else if (rest[i] === '--answers-from') opts.seed = rest[++i];
    else if (rest[i] === '--pack-file') opts.packFile = path.resolve(rest[++i]);
    else if (rest[i] === '--project') opts.project = path.resolve(rest[++i]);
    else if (rest[i] === '--current') opts.current = true;
    else if (rest[i] === '--advanced') opts.advanced = true;
    else if (rest[i] === '--defaults') opts.defaults = true;
    else if (rest[i] === '--risk') opts.risk = rest[++i];
    else if (rest[i] === '--budget') opts.budget = Number(rest[++i]);
    else if (rest[i] === '--spent') opts.spent = Number(rest[++i]);
    else if (rest[i].startsWith('--')) {
      console.error(`interview: unknown argument ${rest[i]}\n${USAGE}`);
      return 2;
    } else id = rest[i];
  }
  const packFile = opts.packFile ?? path.join(root, 'src/packs', id ?? '', 'pack.json');
  if (!['next', 'validate'].includes(verb) || !id || !existsSync(packFile)) {
    console.error(`interview: ${!id || !existsSync(packFile) ? `unknown pack "${id ?? ''}" (see "go-getter packs")` : `unknown verb "${verb ?? ''}"`}\n${USAGE}`);
    return 2;
  }
  const pack = loadPack(packFile);
  const packErrors = validatePack(loadPackSchema(root), pack);
  if (packErrors.length) {
    console.error(`interview: invalid pack:\n  ${packErrors.join('\n  ')}`);
    return 1;
  }
  try {
    const layers = [];
    if (opts.current) {
      const adopted = adoptedArtifacts(opts.project, pack.id);
      if (!adopted.length) throw new Error(`pack "${pack.id}" has not been adopted here; --current needs recorded answers`);
      layers.push({ answers: renameAnswers(pack, currentAnswers(adopted)) });
    }
    if (opts.seed) layers.push(readSeed(pack, readJson(opts.seed)));
    if (opts.answers && (!opts.defaults || existsSync(path.resolve(opts.answers)))) layers.push(readJson(opts.answers));
    const input = mergeInputs(...layers);
    if (verb === 'validate') {
      const errors = validateInput(pack, input);
      console.log(JSON.stringify({ ok: !errors.length, errors }, null, 2));
      return errors.length ? 1 : 0;
    }
    if (opts.defaults) return defaultsRun(pack, input, opts);
    const result = nextQuestion(pack, input, { advanced: opts.advanced });
    console.log(JSON.stringify(result, null, 2));
    return result.errors ? 1 : 0;
  } catch (err) {
    console.error(`interview: ${err.message}`);
    return 1;
  }
}
