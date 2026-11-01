// go-getter ship [--title <type: summary>] [--why <intent>] [--no-merge] [--allow-no-ci] [--dry-run] [--review] [--interval <s>] [--timeout <min>] [--project <dir>]
// Commit to merge in one deterministic command (decision 0157): checks, message with Refs, push, pull request, CI, squash merge on green.
import path from 'node:path';
import { ship, ShipError, claudeReview } from '../ship.mjs';
import { repoRoot } from '../plan.mjs';

const USAGE = 'usage: go-getter ship [--title "type: summary"] [--why "<intent>"] [--no-merge] [--allow-no-ci] [--dry-run] [--review] [--interval <seconds>] [--timeout <minutes>] [--project <dir>]';
const VALUE = ['--title', '--why', '--interval', '--timeout', '--project'];

export default async function shipCommand({ args }) {
  const opts = {};
  let project = process.cwd();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUE.includes(a)) {
      if (args[i + 1] === undefined || args[i + 1].startsWith('--')) {
        console.error(USAGE);
        return 2;
      }
      const v = args[++i];
      if (a === '--title') opts.title = v;
      else if (a === '--why') opts.why = v;
      else if (a === '--project') project = path.resolve(v);
      else if (!(Number(v) >= 0)) {
        console.error(USAGE);
        return 2;
      } else if (a === '--interval') opts.intervalMs = Number(v) * 1000;
      else opts.timeoutMs = Number(v) * 60_000;
    } else if (a === '--no-merge') opts.merge = false;
    else if (a === '--allow-no-ci') opts.allowNoCi = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--review') opts.review = claudeReview();
    else {
      console.error(USAGE);
      return 2;
    }
  }
  if (process.env.GO_GETTER_SHIP_NO_CI_GRACE_MS) opts.noCiGraceMs = Number(process.env.GO_GETTER_SHIP_NO_CI_GRACE_MS);
  try {
    const result = await ship(repoRoot(project), opts, undefined, (step, msg) => console.log(`ship ${step}: ${msg}`));
    if (result.merged) console.log(`ship: merged ${result.pr.url}`);
    else if (result.pr) console.log(`ship: opened ${result.pr.url}`);
    return 0;
  } catch (err) {
    if (!(err instanceof ShipError)) throw err;
    console.error(err.message);
    return err.code;
  }
}
