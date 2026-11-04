// go-getter outcome check [id]: refuse an outcome brief that lacks a meter, target, window or attribution method.
import { outcomeProblems, readOutcomes } from '../outcome.mjs';

const USAGE = 'usage: go-getter outcome check [id]';

export default function outcomeCommand({ args }) {
  const [sub, id, ...rest] = args;
  if (sub !== 'check' || rest.length || (id && id.startsWith('--'))) {
    console.error(USAGE);
    return 2;
  }
  const problems = outcomeProblems(process.cwd(), id);
  if (problems.length) {
    console.error('outcome check:');
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log(`outcome check: ok (${id ? 1 : readOutcomes(process.cwd()).length} brief${id ? '' : 's'})`);
  return 0;
}
