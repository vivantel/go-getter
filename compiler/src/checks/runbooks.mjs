// Runbook spike (decision 0104): every committed docs/runbooks/<guardrail-id>/SKILL.md equals a fresh build.
import path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { checkRunbook } from '../runbook.mjs';

export default function checkRunbooks({ args }) {
  const project = args.includes('--project') ? path.resolve(args[args.indexOf('--project') + 1]) : process.cwd();
  const dir = path.join(project, 'docs/runbooks');
  const ids = existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
  const problems = [];
  for (const id of ids) {
    try {
      const r = checkRunbook(project, id);
      if (!r.ok) problems.push(r.message);
    } catch (err) {
      problems.push(err.message);
    }
  }
  if (problems.length) {
    console.error('check runbooks:');
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log(`check runbooks: ok (${ids.length} runbooks)`);
  return 0;
}
