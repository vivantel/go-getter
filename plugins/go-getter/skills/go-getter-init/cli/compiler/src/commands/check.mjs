// go-getter check [--project <dir>] [--guardrail <id>] [--stage <name>]: run every tier-3 guardrail check.
import path from 'node:path';
import { runTier3 } from '../enforce.mjs';

export default async function checkAll({ args }) {
  let project = process.cwd();
  let onlyGuardrail;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project') project = path.resolve(args[++i]);
    else if (args[i] === '--guardrail') onlyGuardrail = args[++i];
    else if (args[i] === '--stage') i++; // reserved: all stages run every tier-3 check today
  }
  const results = await runTier3(project, { onlyGuardrail });
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.guardrail}${r.message ? ` — ${r.message}` : ''}`);
  console.log(`go-getter check: ${results.length - failed.length}/${results.length} passed`);
  return failed.length ? 1 : 0;
}
