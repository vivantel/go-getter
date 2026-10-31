// go-getter interview next|validate <pack-id> [--answers <file>] [--answers-from <file>] [--current] [--advanced] [--project <dir>] [--pack-file <file>]
// The interview's question logic (decision 0147): a pure function of the pack and the answers, printed as JSON for the
// active agent to render. It writes nothing. --current starts from the answers recorded in the project's artifacts
// (so an update gap is asked alone); --answers-from seeds from another answers file as untrusted data (decision 0149).
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { loadPack, loadPackSchema, validatePack } from '../packs.mjs';
import { mergeInputs, nextQuestion, readSeed, validateInput } from '../interview.mjs';
import { adoptedArtifacts, currentAnswers } from '../reconfigure.mjs';
import { renameAnswers } from '../render.mjs';

const USAGE = 'usage: go-getter interview next|validate <pack-id> [--answers <file>] [--answers-from <file>] [--current] [--advanced] [--project <dir>]';

const readJson = (file) => JSON.parse(readFileSync(path.resolve(file), 'utf8'));

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
    if (opts.answers) layers.push(readJson(opts.answers));
    const input = mergeInputs(...layers);
    if (verb === 'validate') {
      const errors = validateInput(pack, input);
      console.log(JSON.stringify({ ok: !errors.length, errors }, null, 2));
      return errors.length ? 1 : 0;
    }
    const result = nextQuestion(pack, input, { advanced: opts.advanced });
    console.log(JSON.stringify(result, null, 2));
    return result.errors ? 1 : 0;
  } catch (err) {
    console.error(`interview: ${err.message}`);
    return 1;
  }
}
