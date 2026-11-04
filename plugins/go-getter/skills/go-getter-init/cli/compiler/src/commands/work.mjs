// go-getter work claim|heartbeat|release <unit> [--as <worker>] [--kind human|agent|ci] [--remote <name>] [--issuer <worker> --issuer-kind <k>] [--parent <unit>]
// A unit is claimed with a lease in the feature's claims ledger (decision 0166); the library is compiler/src/work/.
import path from 'node:path';
import { repoRoot } from '../plan.mjs';
import { remoteOf, workerId } from '../work/ledger.mjs';
import { KINDS } from '../work/claim.mjs';
import { claimUnit, clockNow, heartbeatUnit, hostDateFor, identity, releaseUnit } from '../work/ops.mjs';
import { planIssue, writeMode } from '../trackers/write.mjs';

const USAGE = 'usage: go-getter work claim|heartbeat|release <unit> [--as <worker>] [--kind human|agent|ci] [--remote <name>] [--issuer <worker> --issuer-kind human|agent|ci] [--parent <unit>] [--accept-remote-ledger] [--unverified-clock]';
const FLAGS = ['--as', '--kind', '--remote', '--issuer', '--issuer-kind', '--parent'];

// One comment on the unit's issue for a state change, only where the project's tracker-writes answer is `allow`.
const notifier = (root) => async (text, { file, step }) => {
  if (!step.issueRef || step.kind || writeMode(root) !== 'allow') return;
  const r = await planIssue(root, path.join(root, file), file, 'comment', step.id, { text: `go-getter: ${step.unit} ${text}` });
  if (!r.ok) console.error(`work: tracker comment not posted: ${r.error}`);
};

export default async function workCommand({ args }) {
  const [sub, unit, ...rest] = args;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--accept-remote-ledger') {
      flags.accept = true;
      continue;
    }
    if (rest[i] === '--unverified-clock') {
      flags.unverified = true;
      continue;
    }
    if (!FLAGS.includes(rest[i]) || rest[i + 1] === undefined) {
      console.error(USAGE);
      return 2;
    }
    flags[rest[i].slice(2)] = rest[++i];
  }
  if (!['claim', 'heartbeat', 'release'].includes(sub) || !unit || unit.startsWith('--') || (flags.kind && !KINDS.includes(flags.kind)) || (flags['issuer-kind'] && !KINDS.includes(flags['issuer-kind'])) || Boolean(flags.issuer) !== Boolean(flags['issuer-kind'])) {
    console.error(USAGE);
    return 2;
  }
  const root = repoRoot(process.cwd());
  let who;
  try {
    who = identity(root, { as: flags.as, kind: flags.kind });
  } catch (e) {
    console.error(`work: ${e.message}`);
    return 2;
  }
  const remote = flags.remote ? remoteOf(root, flags.remote) : undefined;
  if (flags.remote && !remote) {
    console.error(`work: no remote ${flags.remote}`);
    return 1;
  }
  try {
    const now = clockNow();
    const notify = notifier(root);
    if (sub === 'claim') {
      const issuer = flags.issuer ? { kind: flags['issuer-kind'], id: workerId(flags.issuer) } : who;
      const r = await claimUnit(root, unit, who, { now, remote, issuer, parent: flags.parent, notify, acceptRemoteLedger: flags.accept, unverifiedClock: flags.unverified, hostDate: await hostDateFor(root, remote ?? remoteOf(root)) });
      if (!r.ok) {
        console.error(`work claim: ${r.error}`);
        return r.code === 'queued' ? 3 : 1;
      }
      console.log(`${r.entry.unit}: claimed by ${who.kind} ${who.id}, lease to ${r.entry.expires}${r.tookOver ? ` (took over from ${r.tookOver.id})` : ''}`);
      if (r.note) console.error(`work claim: ${r.note}`);
      return 0;
    }
    if (sub === 'heartbeat') {
      const r = await heartbeatUnit(root, unit, who, { now, remote, acceptRemoteLedger: flags.accept, hostDate: await hostDateFor(root, remote ?? remoteOf(root)) });
      if (!r.ok) {
        console.error(`work heartbeat: ${r.error}`);
        return 1;
      }
      console.log(r.renewed ? `${unit}: renewed until ${r.until}` : `${unit}: not renewed (${r.reason})`);
      return 0;
    }
    const r = await releaseUnit(root, unit, who, { now, remote, notify, acceptRemoteLedger: flags.accept });
    if (!r.ok) {
      console.error(`work release: ${r.error}`);
      return 1;
    }
    console.log(`${unit}: released`);
    return 0;
  } catch (e) {
    console.error(`work ${sub}: ${(e.stderr?.toString().trim() || e.message).split('\n')[0]}`);
    return 1;
  }
}
