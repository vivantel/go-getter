// go-getter render-pack <id> [--answers <file>] [--answers-from <file>] [--project <dir>] [--pack-file <file>] [--dry-run]
// Answers file: {"answers": {"<question>": "<option>" | ["<option>", ...]}, "profile"?: {"<topic>": "<profile>"}, "acceptedBy": "<name>", "date"?: "YYYY-MM-DD", "detect"?: {...}}
// --answers-from seeds the answers from another file as untrusted data (decision 0149); --answers wins over it. A chosen
// profile expands into answers (0150) and an advanced question not answered takes its default (0151); `taken` lists both.
import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { retiredPackNote, loadPack, loadPackSchema, validatePack } from '../packs.mjs';
import { planRender, applyRender } from '../render.mjs';
import { mergeInputs, readSeed, resolveAnswers } from '../interview.mjs';

export default function renderPackCommand({ root, args }) {
  let id;
  let answersFile;
  let seedFile;
  let project = process.cwd();
  let packFile;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--answers') answersFile = args[++i];
    else if (args[i] === '--answers-from') seedFile = args[++i];
    else if (args[i] === '--project') project = path.resolve(args[++i]);
    else if (args[i] === '--pack-file') packFile = path.resolve(args[++i]);
    else if (args[i] === '--dry-run') dryRun = true;
    else id = args[i];
  }
  packFile ??= path.join(root, 'src/packs', id ?? '', 'pack.json');
  if (!existsSync(packFile) || !(answersFile || seedFile)) {
    const note = !existsSync(packFile) && retiredPackNote(root, id);
    if (note) console.error(`render-pack: ${note}`);
    console.error('usage: go-getter render-pack <pack-id> [--answers <file>] [--answers-from <file>] [--project <dir>] [--dry-run]');
    return 2;
  }
  const pack = loadPack(packFile);
  const errors = validatePack(loadPackSchema(root), pack);
  if (errors.length) {
    console.error(`render-pack: invalid pack:\n  ${errors.join('\n  ')}`);
    return 1;
  }
  try {
    const read = (file) => JSON.parse(readFileSync(path.resolve(file), 'utf8'));
    const input = mergeInputs(seedFile && readSeed(pack, read(seedFile)), answersFile && read(answersFile));
    const resolved = resolveAnswers(pack, input, { sinceFallback: true });
    const plan = planRender({
      root: project,
      pack,
      answers: { ...input.answers, ...resolved.answers },
      acceptedBy: input.acceptedBy,
      date: input.date ?? new Date().toISOString().slice(0, 10),
      detect: input.detect ?? {},
    });
    const paths = dryRun
      ? [...plan.artifacts.map((a) => a.path), ...plan.files.map((f) => f.path), ...(plan.newTags.length ? ['docs/skills/tags.md'] : [])]
      : applyRender({ root: project, plan });
    console.log(JSON.stringify({ pack: plan.generatedBy, dryRun, newTags: plan.newTags, paths, taken: resolved.taken }, null, 2));
    return 0;
  } catch (err) {
    console.error(`render-pack: ${err.message}`);
    return 1;
  }
}
