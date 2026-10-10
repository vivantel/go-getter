// go-getter runbook build <guardrail-or-procedure-id> [--check]: spike, plan docs/plans/runbook-spike.md (decision 0104).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildRunbook, checkRunbook, runbookPath } from '../runbook.mjs';

const USAGE = 'usage: go-getter runbook build <guardrail-or-procedure-id> [--check]';

export default function runbookCommand({ args }) {
  const [sub, id, ...rest] = args;
  const check = rest.includes('--check');
  if (sub !== 'build' || !id || id.startsWith('--') || rest.some((a) => a !== '--check')) {
    console.error(USAGE);
    return 2;
  }
  const root = process.cwd();
  try {
    if (check) {
      const r = checkRunbook(root, id);
      console.log(r.ok ? `runbook ${id}: ok` : `runbook ${id}: ${r.message}`);
      return r.ok ? 0 : 1;
    }
    const file = path.join(root, runbookPath(id));
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, buildRunbook(root, id));
    console.log(`wrote ${runbookPath(id)}`);
    return 0;
  } catch (err) {
    console.error(err.message);
    return 1;
  }
}
