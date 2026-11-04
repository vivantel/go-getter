// go-getter work next [--owner-kind K] [--dry-run] | scope-check [--base <ref>] | park <unit> --ask <file> | asks [--mine] | answer <ask> <choice> | request <unit> --to <unit> [--text T] [--park] | claim|heartbeat|release <unit> [--as <worker>] [--kind human|agent|ci] [--remote <name>] [--issuer <worker> --issuer-kind <k>] [--parent <unit>]
// A unit is claimed with a lease in the feature's claims ledger (decision 0166); the library is compiler/src/work/.
import path from 'node:path';
import { repoRoot } from '../plan.mjs';
import { remoteOf, workerId } from '../work/ledger.mjs';
import { KINDS } from '../work/claim.mjs';
import { clockNow, heartbeatUnit, hostDateFor, identity, releaseUnit } from '../work/ops.mjs';
import { nextUnits } from '../work/next.mjs';
import { answerAsk, formatAsk, listAsks, parkAsk, readAskFile, resumeClaim, sweepAsks } from '../work/asks.mjs';
import { checkScope, formatScope, requestChange } from '../work/scope-gate.mjs';
import { planIssue, writeMode } from '../trackers/write.mjs';

const USAGE = 'usage: go-getter work next [--owner-kind human|agent|ci] [--dry-run] [--as <worker>] [--remote <name>] | scope-check [--base <ref>] | park <unit> --ask <file> [--as <worker>] | asks [--mine] [--as <worker>] [--kind human|agent|ci] | answer <ask> <choice> [--as <worker>] [--kind human] | request <unit> --to <unit> [--text <t>] [--park] [--as <worker>] | claim|heartbeat|release <unit> [--as <worker>] [--kind human|agent|ci] [--remote <name>] [--issuer <worker> --issuer-kind human|agent|ci] [--parent <unit>] [--accept-remote-ledger] [--unverified-clock]';
const FLAGS = ['--as', '--kind', '--remote', '--issuer', '--issuer-kind', '--parent'];

// One comment on the unit's issue for a state change, only where the project's tracker-writes answer is `allow`.
const notifier = (root) => async (text, { file, step }) => {
  if (!step.issueRef || step.kind || writeMode(root) !== 'allow') return;
  const r = await planIssue(root, path.join(root, file), file, 'comment', step.id, { text: `go-getter: ${step.unit} ${text}` });
  if (!r.ok) console.error(`work: tracker comment not posted: ${r.error}`);
};

// `work next`: the units this caller may take, and unless --dry-run the first of them, claimed. A claim lost to a racing worker
// moves on to the next ready unit.
async function workNext(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') flags.dry = true;
    else if (['--owner-kind', '--as', '--remote'].includes(args[i]) && args[i + 1] !== undefined) flags[args[i].slice(2)] = args[++i];
    else {
      console.error(USAGE);
      return 2;
    }
  }
  if (flags['owner-kind'] && !KINDS.includes(flags['owner-kind'])) {
    console.error(USAGE);
    return 2;
  }
  const root = repoRoot(process.cwd());
  let who;
  try {
    who = identity(root, { as: flags.as, kind: flags['owner-kind'] });
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
    const found = nextUnits(root, { ownerKind: who.kind, now, remote });
    for (const q of found.queued) console.log(`${q.unit}: queued behind ${q.behind}${q.holder ? ` (${q.holder.kind} ${q.holder.id})` : ''}${q.tokens ? `, ${q.tokens.join(' and ')}` : ''}`);
    if (!found.ready.length) {
      console.log('work next: no unit is ready');
      return 0;
    }
    if (flags.dry) {
      for (const r of found.ready) console.log(`${r.unit}: ready, ${r.title}`);
      return 0;
    }
    for (const r of found.ready) {
      const c = await resumeClaim(root, r.unit, who, { now, remote, notify: notifier(root), hostDate: await hostDateFor(root, remote ?? remoteOf(root)) });
      if (c.ok) {
        console.log(`${r.unit}: claimed by ${who.kind} ${who.id}, lease to ${c.entry.expires}; ${r.title}`);
        if (c.rebase) console.log(`${r.unit}: ${c.rebase.note}`);
        return 0;
      }
      if (c.code !== 'queued') {
        console.error(`work next: ${c.error}`);
        return 1;
      }
      console.log(`${r.unit}: ${c.error}`);
    }
    console.log('work next: every ready unit was taken meanwhile');
    return 3;
  } catch (e) {
    console.error(`work next: ${(e.stderr?.toString().trim() || e.message).split('\n')[0]}`);
    return 1;
  }
}

// `work scope-check`: exit 1 when a changed path lies outside the scope of the unit claimed from this worktree.
function workScopeCheck(args) {
  const i = args.indexOf('--base');
  const base = i >= 0 ? args[i + 1] : undefined;
  if (args.some((a, n) => a !== '--base' && args[n - 1] !== '--base') || (i >= 0 && (!base || base.startsWith('--')))) {
    console.error(USAGE);
    return 2;
  }
  try {
    const r = checkScope(repoRoot(process.cwd()), { base });
    console.log(formatScope(r));
    return r.status === 'out-of-scope' ? 1 : 0;
  } catch (e) {
    console.error(`work scope-check: ${(e.stderr?.toString().trim() || e.message).split('\n')[0]}`);
    return 1;
  }
}

// `work request <unit> --to <unit>`: a change request to the unit that owns what this one needs; --park also parks this unit.
async function workRequest(args) {
  const [unit, ...rest] = args;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--park') flags.park = true;
    else if (['--to', '--text', '--as', '--kind', '--remote'].includes(rest[i]) && rest[i + 1] !== undefined) flags[rest[i].slice(2)] = rest[++i];
    else flags.bad = true;
  }
  if (!unit || unit.startsWith('--') || !flags.to || flags.bad || (flags.kind && !KINDS.includes(flags.kind))) {
    console.error(USAGE);
    return 2;
  }
  const root = repoRoot(process.cwd());
  try {
    const who = identity(root, { as: flags.as, kind: flags.kind });
    const remote = flags.remote ? remoteOf(root, flags.remote) : undefined;
    const tracker = writeMode(root) === 'allow' ? async (text, { file, step }) => planIssue(root, path.join(root, file), file, 'comment', step.id, { text }) : undefined;
    const r = await requestChange(root, unit, flags.to, who, { text: flags.text, park: flags.park, comment: tracker, remote });
    if (!r.ok) {
      console.error(`work request: ${r.error}`);
      return 1;
    }
    console.log(`${r.from}: change request to ${r.to} ${r.how === 'comment' ? 'posted as a comment on its issue' : 'recorded; post this on the owner\'s issue or unit:'}${r.parked ? '; parked, scope released' : ''}`);
    if (r.how !== 'comment') console.log(r.text);
    if (r.warning) console.error(`work request: ${r.warning}`);
    return 0;
  } catch (e) {
    console.error(`work request: ${(e.stderr?.toString().trim() || e.message).split('\n')[0]}`);
    return 1;
  }
}

// Flags shared by park, asks and answer: the caller's identity and remote. Returns { flags, rest } or null on a bad flag.
function askFlags(args, extra = []) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mine') flags.mine = true;
    else if (['--as', '--kind', '--remote', ...extra].includes(args[i]) && args[i + 1] !== undefined) flags[args[i].slice(2)] = args[++i];
    else if (args[i].startsWith('--')) return null;
    else rest.push(args[i]);
  }
  return flags.kind && !KINDS.includes(flags.kind) ? null : { flags, rest };
}

// `work park`, `work asks`, `work answer`: decision 0168. Parking releases the worker; asks lists the routed queue (and applies the
// timeout policy first); answer records the answerer and returns the unit to ready.
async function workAsk(sub, args) {
  const parsed = askFlags(args, ['--ask']);
  const need = { park: 1, asks: 0, answer: 2 }[sub];
  if (!parsed || parsed.rest.length !== need || (sub === 'park' && !parsed.flags.ask) || (sub !== 'park' && parsed.flags.ask) || (sub !== 'asks' && parsed.flags.mine)) {
    console.error(USAGE);
    return 2;
  }
  const { flags, rest } = parsed;
  const root = repoRoot(process.cwd());
  try {
    const who = identity(root, { as: flags.as, kind: flags.kind });
    const remote = flags.remote ? remoteOf(root, flags.remote) : undefined;
    if (flags.remote && !remote) {
      console.error(`work: no remote ${flags.remote}`);
      return 1;
    }
    if (sub === 'park') {
      const read = readAskFile(path.resolve(flags.ask));
      if (read.error) {
        console.error(`work park: ${read.error}`);
        return 1;
      }
      const r = await parkAsk(root, rest[0], who, read.ask, { remote });
      if (!r.ok) {
        console.error(`work park: ${r.error}`);
        return 1;
      }
      console.log(`${r.entry.unit}: parked on ask ${r.ask.id} (${r.ask.class}), worker released, scope released${r.ask.route.length ? `; routed to ${r.ask.route.join(' > ')}` : '; no owner on record, any human may answer'}`);
      return 0;
    }
    if (sub === 'answer') {
      const r = await answerAsk(root, rest[0], rest[1], who, { remote });
      if (!r.ok) {
        console.error(`work answer: ${r.error}`);
        return 1;
      }
      console.log(`${r.unit}: answered by ${who.id}; the unit is ready`);
      return 0;
    }
    for (const t of await sweepAsks(root, who, { remote })) console.log(`${t.unit}: timed out, ${t.outcome}${t.draft ? ` (draft decision ${t.draft})` : ''}`);
    const asks = listAsks(root, { who, mine: flags.mine, remote });
    if (!asks.length) console.log('work asks: no open ask');
    for (const a of asks) console.log(formatAsk(a));
    return 0;
  } catch (e) {
    console.error(`work ${sub}: ${(e.stderr?.toString().trim() || e.message).split('\n')[0]}`);
    return 1;
  }
}

export default async function workCommand({ args }) {
  if (['park', 'asks', 'answer'].includes(args[0])) return workAsk(args[0], args.slice(1));
  if (args[0] === 'next') return workNext(args.slice(1));
  if (args[0] === 'scope-check') return workScopeCheck(args.slice(1));
  if (args[0] === 'request') return workRequest(args.slice(1));
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
      const r = await resumeClaim(root, unit, who, { now, remote, issuer, parent: flags.parent, notify, acceptRemoteLedger: flags.accept, unverifiedClock: flags.unverified, hostDate: await hostDateFor(root, remote ?? remoteOf(root)) });
      if (!r.ok) {
        console.error(`work claim: ${r.error}`);
        return r.code === 'queued' ? 3 : 1;
      }
      console.log(`${r.entry.unit}: claimed by ${who.kind} ${who.id}, lease to ${r.entry.expires}${r.tookOver ? ` (took over from ${r.tookOver.id})` : ''}`);
      if (r.note) console.error(`work claim: ${r.note}`);
      if (r.rebase) console.log(`${r.entry.unit}: ${r.rebase.note}`);
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
