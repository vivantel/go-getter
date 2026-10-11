// go-getter approvals list [--json] | add <secret-path> -- <command> [args...] | revoke (<id> | --all)
// Personal approvals to use a secret file (decision 0126). `add` and `revoke` change what an agent may do with a secret, so a
// person runs them; the pre-tool hook refuses an agent's call to either (step 5 of the secret-use plan).
import { realpathSync } from 'node:fs';
import { add, list, revoke, storeFile } from '../secrets/approvals.mjs';
import { restrictedPatterns } from '../hook.mjs';
import { matchesAny } from '../glob.mjs';
import { repoRoot } from '../plan.mjs';

const USAGE = 'usage: go-getter approvals list [--json] | add <secret-path> -- <command> [args...] | revoke (<id> | --all)';

const describe = (e) => `${e.id}  ${e.path}  ${e.command.join(' ')}  ${e.current ? 'current' : 'STALE: the code changed since it was approved'}  (${e.files} file${e.files === 1 ? '' : 's'}, approved ${e.approvedAt.slice(0, 10)})`;

export default function approvalsCommand({ args }) {
  const [sub, ...rest] = args;
  const project = repoRoot(process.cwd());
  try {
    if (sub === 'list' && rest.every((a) => a === '--json')) {
      const entries = list(project);
      if (rest.includes('--json')) console.log(JSON.stringify(entries, null, 2));
      else console.log(entries.length ? entries.map(describe).join('\n') : `no approvals for ${realpathSync(project)} (store: ${storeFile()})`);
      return 0;
    }
    if (sub === 'add') {
      const dash = rest.indexOf('--');
      if (dash !== 1 || rest.length < 3) {
        console.error(USAGE);
        return 2;
      }
      const [secretPath] = rest;
      if (!matchesAny(secretPath.replace(/^\.\//, ''), restrictedPatterns(project))) {
        console.error(`approvals: ${secretPath} is not a restricted path of this project, so there is nothing to approve`);
        return 1;
      }
      const entry = add(project, rest.slice(dash + 1), secretPath, { host: process.env.GO_GETTER_HOST });
      console.log(`approved ${entry.id}: ${entry.command.join(' ')} may use ${entry.path} while its code is unchanged`);
      return 0;
    }
    if (sub === 'revoke' && rest.length === 1) {
      const removed = revoke(project, rest[0] === '--all' ? { all: true } : { id: rest[0] });
      console.log(removed ? `revoked ${removed} approval${removed === 1 ? '' : 's'}` : `no approval ${rest[0]} for this project`);
      return removed ? 0 : 1;
    }
  } catch (err) {
    console.error(`approvals: ${err.message.split('\n')[0]}`);
    return 1;
  }
  console.error(USAGE);
  return 2;
}
