// go-getter ship [--title <type: summary>] [--why <intent>] [--allow-no-ci] [--dry-run] [--review] [--interval <s>] [--timeout <min>] [--project <dir>]
// Commit to merge in one deterministic command (decisions 0157, 0163): checks, message with Refs, push, pull request, CI, squash merge on green.
// `go-getter pr` is the same without the merge; both live here so the options stay one list.
import path from 'node:path';
import { ship, openPr, ShipError, claudeReview } from '../ship.mjs';
import { repoRoot } from '../plan.mjs';

const SHIP_USAGE = 'usage: go-getter ship [--title "type: summary"] [--why "<intent>"] [--allow-no-ci] [--dry-run] [--review] [--interval <seconds>] [--timeout <minutes>] [--project <dir>]';
const PR_USAGE = 'usage: go-getter pr [--title "type: summary"] [--why "<intent>"] [--dry-run] [--review] [--interval <seconds>] [--timeout <minutes>] [--project <dir>]';
const VALUE = ['--title', '--why', '--interval', '--timeout', '--project'];

export async function runVerb(verb, args) {
  const USAGE = verb === 'pr' ? PR_USAGE : SHIP_USAGE;
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
    } else if (a === '--allow-no-ci' && verb === 'ship') opts.allowNoCi = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--review') opts.review = claudeReview();
    else {
      console.error(USAGE);
      return 2;
    }
  }
  if (process.env.GO_GETTER_SHIP_NO_CI_GRACE_MS) opts.noCiGraceMs = Number(process.env.GO_GETTER_SHIP_NO_CI_GRACE_MS);
  try {
    const result = await (verb === 'pr' ? openPr : ship)(repoRoot(project), verb === 'pr' ? { ...opts, verb } : opts, undefined, (step, msg) => console.log(`${verb} ${step}: ${msg}`));
    if (result.merged) console.log(`ship: merged ${result.pr.url}`);
    else if (result.pr) console.log(`${verb}: opened ${result.pr.url}`);
    return 0;
  } catch (err) {
    if (!(err instanceof ShipError)) throw err;
    console.error(err.message);
    return err.code;
  }
}

export default ({ args }) => runVerb('ship', args);
