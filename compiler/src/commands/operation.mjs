// go-getter operation check [id] | status [id]: validate operating charters; list which health thresholds are crossed.
import { operationProblems, operationStatus, readCharters } from '../operation.mjs';

const USAGE = 'usage: go-getter operation check [id] | status [id]';

export default function operationCommand({ args }) {
  const [sub, id, ...rest] = args;
  if (!['check', 'status'].includes(sub) || rest.length || (id && id.startsWith('--'))) {
    console.error(USAGE);
    return 2;
  }
  const root = process.cwd();
  if (sub === 'check') {
    const problems = operationProblems(root, id);
    if (problems.length) {
      console.error('operation check:');
      for (const p of problems) console.error(`  ${p}`);
      return 1;
    }
    const n = id ? 1 : readCharters(root).length;
    console.log(`operation check: ok (${n} charter${n === 1 ? '' : 's'})`);
    return 0;
  }
  const rows = operationStatus(root, id);
  if (id && !readCharters(root).some((c) => c.id === id)) {
    console.error(`operation status: no operating charter docs/operations/${id}.md`);
    return 1;
  }
  const crossed = rows.filter((r) => r.state === 'crossed');
  for (const r of rows.filter((x) => x.state === 'unreadable')) console.log(`${r.charter}: unreadable frontmatter (${r.note})`);
  for (const r of rows.filter((x) => x.state === 'no-reading' || x.state === 'not-comparable')) console.log(`${r.charter}: ${r.meter} ${r.state === 'no-reading' ? 'has no reading' : `latest ${JSON.stringify(r.value)} cannot be compared`}`);
  for (const r of crossed) console.log(`${r.charter}: ${r.meter} crossed (${r.value} ${r.direction} ${r.threshold}); owner ${r.owner}; escalate ${[].concat(r.escalation ?? []).join(' > ')}`);
  console.log(crossed.length ? `${crossed.length} threshold${crossed.length === 1 ? '' : 's'} crossed` : 'no threshold crossed');
  return 0;
}
