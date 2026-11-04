// Lint (decision 0179 item 5): a meter used by no outcome, or whose cost per reading exceeds its outcomes' budget.
import path from 'node:path';
import { meterFindings, loadMeters } from '../measure.mjs';

export default function checkMeters({ args }) {
  const project = args.includes('--project') ? path.resolve(args[args.indexOf('--project') + 1]) : process.cwd();
  const problems = [...loadMeters(project).flatMap((m) => m.problems.map((p) => `${m.file}: ${p}`)), ...meterFindings(project)];
  if (problems.length) {
    console.error('check meters:');
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log('check meters: ok');
  return 0;
}
