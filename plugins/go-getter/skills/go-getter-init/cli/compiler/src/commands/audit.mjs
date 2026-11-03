// go-getter audit pick [--since <iso>] [--rate <0..1>] [--seed <n>] [--project <dir>]
// go-getter audit fail <pr> --as check|guardrail|instruction [--project <dir>]
// The sampled audit of decision 0158: `pick` writes audit.json for the digest; `fail` creates the follow-up stub.
import path from 'node:path';
import { auditPick, auditFail, AUDIT_KINDS } from '../audit.mjs';

const USAGE = `usage: go-getter audit pick [--since <iso>] [--rate <0..1>] [--seed <n>] [--project <dir>]
       go-getter audit fail <pr> --as ${AUDIT_KINDS.join('|')} [--project <dir>]`;

export default function auditCommand({ args }) {
  const [sub, ...rest] = args;
  if (sub !== 'pick' && sub !== 'fail') {
    console.error(USAGE);
    return 2;
  }
  let project = process.cwd();
  let since;
  let rate;
  let seed;
  let as;
  const positional = [];
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const v = rest[i + 1];
    if (a === '--project' && v) project = path.resolve(rest[++i]);
    else if (a === '--since' && v && sub === 'pick') since = new Date(rest[++i]);
    else if (a === '--rate' && v && sub === 'pick') rate = Number(rest[++i]);
    else if (a === '--seed' && v && sub === 'pick') seed = Number(rest[++i]);
    else if (a === '--as' && v && sub === 'fail') as = rest[++i];
    else if (!a.startsWith('--') && sub === 'fail') positional.push(a);
    else {
      console.error(`audit: unknown argument ${a}\n${USAGE}`);
      return 2;
    }
  }
  if ((since && Number.isNaN(since.getTime())) || (rate !== undefined && !(rate >= 0 && rate <= 1)) || (seed !== undefined && !Number.isFinite(seed))) {
    console.error(`audit: bad --since, --rate or --seed\n${USAGE}`);
    return 2;
  }
  try {
    if (sub === 'pick') {
      console.log(JSON.stringify(auditPick(project, { ...(since ? { since } : {}), ...(rate !== undefined ? { rate } : {}), ...(seed !== undefined ? { seed } : {}) }), null, 2));
      return 0;
    }
    if (positional.length !== 1 || !as) {
      console.error(USAGE);
      return 2;
    }
    console.log(`audit: wrote ${auditFail(project, Number(positional[0]), as)}`);
    return 0;
  } catch (err) {
    console.error(`audit: ${err.message}`);
    return 1;
  }
}
