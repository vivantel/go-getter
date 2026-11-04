// go-getter release --batch [--dry-run] [--allow-no-ci] [--interval <s>] [--timeout <min>] [--project <dir>]
// Releases everything merged since the last tag as one pull request (decisions 0094, 0157): version from Conventional Commit types,
// changelog and version files, the three verification layers, then the merge, only after a person ran `go-getter approvals release <version>`.
import path from 'node:path';
import { releaseBatch } from '../release.mjs';
import { ShipError } from '../ship.mjs';
import { repoRoot } from '../plan.mjs';

const USAGE = 'usage: go-getter release --batch [--dry-run] [--allow-no-ci] [--interval <seconds>] [--timeout <minutes>] [--project <dir>]';
const VALUE = ['--interval', '--timeout', '--project'];

export default async function releaseCommand({ args }) {
  const opts = {};
  let project = process.cwd();
  let batch = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUE.includes(a)) {
      const v = args[++i];
      if (v === undefined || v.startsWith('--') || (a !== '--project' && !(Number(v) >= 0))) {
        console.error(USAGE);
        return 2;
      }
      if (a === '--project') project = path.resolve(v);
      else if (a === '--interval') opts.intervalMs = Number(v) * 1000;
      else opts.timeoutMs = Number(v) * 60_000;
    } else if (a === '--batch') batch = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--allow-no-ci') opts.allowNoCi = true;
    else {
      console.error(USAGE);
      return 2;
    }
  }
  if (!batch) {
    console.error(USAGE);
    return 2;
  }
  if (process.env.GO_GETTER_SHIP_NO_CI_GRACE_MS) opts.noCiGraceMs = Number(process.env.GO_GETTER_SHIP_NO_CI_GRACE_MS);
  try {
    const result = await releaseBatch(repoRoot(project), opts, undefined, (step, msg) => console.log(`release ${step}: ${msg}`));
    if (result.merged) console.log(`release: merged ${result.pr.url}; a person publishes it by tagging ${result.tag}`);
    return 0;
  } catch (err) {
    if (!(err instanceof ShipError)) throw err;
    console.error(err.message);
    return err.code;
  }
}
