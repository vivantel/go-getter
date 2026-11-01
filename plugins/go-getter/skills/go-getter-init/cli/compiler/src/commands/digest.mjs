// go-getter digest [--since <iso>] [--mark] [--project <dir>]: the report of procedure reviewing-the-daily-digest, since the last
// digest. --mark records now as the last digest, so the next one starts there.
import path from 'node:path';
import { buildDigest, markDigest } from '../digest.mjs';

const USAGE = 'usage: go-getter digest [--since <iso>] [--mark] [--project <dir>]';

export default function digestCommand({ args }) {
  let project = process.cwd();
  let since;
  let mark = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project' && args[i + 1]) project = path.resolve(args[++i]);
    else if (args[i] === '--since' && args[i + 1]) since = new Date(args[++i]);
    else if (args[i] === '--mark') mark = true;
    else {
      console.error(`digest: unknown argument ${args[i]}\n${USAGE}`);
      return 2;
    }
  }
  if (since && Number.isNaN(since.getTime())) {
    console.error(`digest: --since needs an ISO time\n${USAGE}`);
    return 2;
  }
  const now = new Date();
  console.log(JSON.stringify(buildDigest(project, { now, ...(since ? { since } : {}) }), null, 2));
  if (mark) markDigest(project, now);
  return 0;
}
