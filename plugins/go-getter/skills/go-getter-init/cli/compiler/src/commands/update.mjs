// go-getter update --nudge prints the session-start drift line (nothing when current).
// go-getter update [--yes] [--dry-run] [--force] [--accept-defaults] [--project <dir>]
// --accept-defaults takes the default of each answer no artifact records (decision 0148): it lists them, stops at --dry-run,
// and otherwise writes only after an interactive confirmation (it refuses --yes and a non-interactive run).
// Brings the generated output up to the installed go-getter: prints the plan, then applies it with --yes or on confirmation.
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { driftNudge } from '../manifest.mjs';
import { planUpdate, runUpdate, writePlanSummary } from '../update.mjs';

export default async function updateCommand({ root, args }) {
  let project = process.cwd();
  let yes = false;
  let dryRun = false;
  let force = false;
  let nudge = false;
  let acceptDefaults = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project') project = path.resolve(args[++i]);
    else if (args[i] === '--yes') yes = true;
    else if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--force') force = true;
    else if (args[i] === '--nudge') nudge = true;
    else if (args[i] === '--accept-defaults') acceptDefaults = true;
    else throw new Error(`update: unknown argument ${args[i]}`);
  }
  if (nudge) {
    const line = driftNudge(project, root);
    if (line) console.log(line);
    return 0;
  }
  if (acceptDefaults && yes) {
    console.error('update: --accept-defaults is confirmed by a person after the plan is listed; it cannot be combined with --yes');
    return 2;
  }
  if (acceptDefaults && !dryRun && !process.stdin.isTTY) {
    console.error('update: --accept-defaults needs an interactive confirmation; run it with --dry-run to list the defaults');
    return 2;
  }
  const opts = { root, date: new Date().toISOString().slice(0, 10), force, acceptDefaults };
  let plan;
  try {
    plan = planUpdate(project, opts);
  } catch (err) {
    console.error(`update: ${err.message}`);
    return 1;
  }
  console.log(`update${dryRun ? ' --dry-run' : ''}:`);
  const any = writePlanSummary(plan);
  for (const m of plan.modified) console.error(`  modified: ${m.path} (${m.reason}); skipped, use --force to overwrite or remove it`);
  const status = plan.modified.length ? 1 : 0;
  if (dryRun || !any) return status;
  if (!yes) {
    if (!process.stdin.isTTY) {
      console.log('update: nothing written; re-run with --yes to apply this plan');
      return status;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question('Apply this plan? [y/N] ');
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) {
      console.log('update: nothing written');
      return status;
    }
  }
  runUpdate(project, opts);
  console.log('update: done');
  return status;
}
