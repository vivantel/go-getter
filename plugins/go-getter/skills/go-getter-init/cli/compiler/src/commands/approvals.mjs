// go-getter approvals list [--json] | add <secret-path> -- <command> [args...] | allow <shape> | release <version> [<sha>] | revoke (<id> | <shape> | --all)
// Personal approvals: to use a secret file (decision 0126) and to run an outward command shape without asking (decision 0130).
// `release <version>` records the human approval `go-getter release --batch` needs before it merges (decision 0094): a release is never an approvable shape.
// A release the user asks for in the chat is the other route to that approval (decision 0187); this command stays the typed one.
// `add`, `allow`, `release` and `revoke` change what an agent may do, so a person runs them; the pre-tool hook refuses an agent's call.
import { realpathSync } from 'node:fs';
import { add, list, revoke, storeFile, addShape, listShapes, revokeShape } from '../secrets/approvals.mjs';
import { APPROVABLE, isApprovable } from '../gate.mjs';
import { restrictedPatterns } from '../hook.mjs';
import { matchesAny } from '../glob.mjs';
import { repoRoot } from '../plan.mjs';
import { releaseApprovalId, releaseHead } from '../release.mjs';

const USAGE = 'usage: go-getter approvals list [--json] | add <secret-path> -- <command> [args...] | allow <shape> | revoke (<id> | <shape> | --all)';

const describe = (e) => `${e.id}  ${e.path}  ${e.command.join(' ')}  ${e.current ? 'current' : 'STALE: the code changed since it was approved'}  (${e.files} file${e.files === 1 ? '' : 's'}, approved ${e.approvedAt.slice(0, 10)})`;

export default function approvalsCommand({ args }) {
  const [sub, ...rest] = args;
  const project = repoRoot(process.cwd());
  try {
    if (sub === 'list' && rest.every((a) => a === '--json')) {
      const entries = list(project);
      const shapes = listShapes(project);
      if (rest.includes('--json')) console.log(JSON.stringify(entries, null, 2)); // secret approvals only: the format other tools read
      else {
        const lines = [...entries.map(describe), ...shapes.map((e) => `${e.id}  ${e.id.startsWith('mcp:') ? 'MCP write tool' : e.id.startsWith('stop:') ? 'stopped case (same command, same state)' : e.id.startsWith('release:') ? 'release approved for `release --batch` (one version)' : 'outward command shape'}, may run without asking while its preconditions hold  (approved ${e.approvedAt.slice(0, 10)})`)];
        console.log(lines.length ? lines.join('\n') : `no approvals for ${realpathSync(project)} (store: ${storeFile()})`);
      }
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
    if (sub === 'allow' && rest.length === 1) {
      if (!isApprovable(rest[0])) {
        console.error(`approvals: ${rest[0]} cannot be approved once; the shapes that can are ${APPROVABLE.join(', ')} and mcp:<server>:<tool> (tags, releases, publishing and history rewrites always ask)`);
        return 1;
      }
      const entry = addShape(project, rest[0], { host: process.env.GO_GETTER_HOST });
      console.log(`approved ${entry.id}: it may run without asking in this project while its preconditions hold`);
      return 0;
    }
    if (sub === 'release' && (rest.length === 1 || rest.length === 2)) {
      const head = releaseHead(project);
      const sha = rest[1] ? (head.startsWith(rest[1].toLowerCase()) && rest[1].length >= 7 ? head : null) : head;
      const id = sha && releaseApprovalId(rest[0], sha);
      if (!id) {
        console.error(rest[1] && !sha ? `approvals: ${rest[1]} is not the default branch head (${head}); run \`release --batch --dry-run\` again` : 'approvals: a release is approved by its version, such as v1.2.3');
        return rest[1] && !sha ? 1 : 2;
      }
      const entry = addShape(project, id, { host: process.env.GO_GETTER_HOST });
      console.log(`approved ${entry.id}: \`go-getter release --batch\` may merge the release pull request for that version while the default branch is at that commit`);
      return 0;
    }
    if (sub === 'revoke' && rest.length === 1) {
      const all = rest[0] === '--all';
      const removed = revoke(project, all ? { all: true } : { id: rest[0] }) + revokeShape(project, all ? { all: true } : { id: rest[0] });
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
