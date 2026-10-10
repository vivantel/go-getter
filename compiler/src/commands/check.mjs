// go-getter check [--project <dir>] [--guardrail <id>] [--stage pre-commit|pre-push|ci]: run the tier-3 guardrail checks of
// a stage (an entry without `stages` runs before a push; no stage, or ci, runs every entry).
import path from 'node:path';
import { runTier3, STAGES } from '../enforce.mjs';

export default async function checkAll({ args }) {
  let project = process.cwd();
  let onlyGuardrail;
  let stage;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project') project = path.resolve(args[++i]);
    else if (args[i] === '--guardrail') onlyGuardrail = args[++i];
    else if (args[i] === '--stage') stage = args[++i];
  }
  if (stage !== undefined && !STAGES.includes(stage)) {
    console.error(`usage: go-getter check [--project <dir>] [--guardrail <id>] [--stage ${STAGES.join('|')}]`);
    return 2;
  }
  const results = await runTier3(project, { onlyGuardrail, stage });
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.guardrail}${r.message ? ` — ${r.message}` : ''}`);
  console.log(`go-getter check: ${results.length - failed.length}/${results.length} passed`);
  return failed.length ? 1 : 0;
}
