// Guardrail artifact-ids-have-no-shared-counter: every INDEX.md equals its generation from frontmatter, and no fact or
// decision number is used twice.
import path from 'node:path';
import { indexProblems } from '../artifact-index.mjs';

export default function checkIndexes({ args }) {
  const project = args.includes('--project') ? path.resolve(args[args.indexOf('--project') + 1]) : process.cwd();
  const problems = indexProblems(project);
  if (problems.length) {
    console.error('check indexes:');
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log('check indexes: ok');
  return 0;
}
