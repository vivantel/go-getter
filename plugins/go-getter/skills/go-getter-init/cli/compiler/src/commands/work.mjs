// go-getter work grant <unit> --scope S --spend N --shapes S --asks P --data D [--effects E] [--to W --to-kind K] [--parent U] | spend <unit> <amount> | grant-check | next [--owner-kind K] [--dry-run] | approve <unit> [--as <worker>] [--kind human|agent|ci] [--remote <name>] | approve <unit> [--as <worker>] [--kind human|agent|ci] [--remote <name>] | scope-check [--base <ref>] | park <unit> --ask <file> | asks [--mine] | answer <ask> <choice> | request <unit> --to <unit> [--text T] [--park] | claim|heartbeat|release <unit> [--as <worker>] [--kind human|agent|ci] [--remote <name>] [--issuer <worker> --issuer-kind <k>] [--parent <unit>]
import path from 'node:path';
import { planFiles, repoRoot, stemOf } from '../plan.mjs';
import { remoteOf, workerId } from '../work/ledger.mjs';
import { KINDS } from '../work/claim.mjs';
import { clockNow, heartbeatUnit, hostDateFor, identity, ledgerView, releaseUnit } from '../work/ops.mjs';
import { nextUnits } from '../work/next.mjs';
import { issueGrant, recordSpend } from '../work/grant-ops.mjs';
import { parseGrant } from '../work/grant.mjs';
import { answerAsk, formatAsk, listAsks, parkAsk, readAskFile, resumeClaim, sweepAsks } from '../work/asks.mjs';
import { approveUnit } from '../work/intake.mjs';
import { checkScope, formatScope, requestChange } from '../work/scope-gate.mjs';
import { planIssue, writeMode } from '../trackers/write.mjs';
import { acceptUnit, unaccepted } from '../work/accept.mjs';
import { LEVELS, recordEscape } from '../work/escapes.mjs';

const USAGE = 'usage: go-getter work accept <unit> [--reviewer <cmd>] [--as <worker>] [--kind human|agent|ci] | accept-check | escape <unit> --merged-at step|plan|feature|product --found-at step|plan|feature|product | grant <unit> --scope <tokens> --spend <n> --shapes <ids> --asks all|default-reversible|unrecoverable-only --data <classes> [--effects reversible,money:50/day,physical:z1+z2,legal:nda@acme] [--to <worker> --to-kind human|agent|ci] [--parent <unit>] [--as <worker>] | spend <unit> <amount> [--as <worker>] | grant-check | next [--owner-kind human|agent|ci] [--dry-run] [--as <worker>] [--remote <name>] | scope-check [--base <ref>] | park <unit> --ask <file> [--as <worker>] | asks [--mine] [--as <worker>] [--kind human|agent|ci] | answer <ask> <choice> [--as <worker>] [--kind human] | request <unit> --to <unit> [--text <t>] [--park] [--as <worker>] | claim|heartbeat|release <unit> [--as <worker>] [--kind human|agent|ci] [--remote <name>] [--issuer <worker> --issuer-kind human|agent|ci] [--parent <unit>] [--accept-remote-ledger] [--unverified-clock]';
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
    const found = nextUnits(root, { ownerKind: who.kind, worker: who, now, remote });
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
    return 1
  }
}

// `work approve <unit>`: approve a draft unit as the holder of its parent's claim, the parent's Owner-id or the rule that generated it.
// A unit that needs the Owner-id is printed as an ask (exit 3); nothing is written then.
async function workApprove(args) {
  const [unit, ...rest] = args;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (['--as', '--kind', '--remote'].includes(rest[i]) && rest[i + 1] !== undefined) flags[rest[i].slice(2)] = rest[++i];
    else flags.bad = true;
  }
  if (!unit || unit.startsWith('--') || flags.bad || (flags.kind && !KINDS.includes(flags.kind))) {
    console.error(USAGE);
    return 2;
  }
  const root = repoRoot(process.cwd());
  try {
    const who = identity(root, { as: flags.as, kind: flags.kind });
    const remote = flags.remote ? remoteOf(root, flags.remote) : undefined;
    if (flags.remote && !remote) {
      console.error(`work: no remote ${flags.remote}`);
      return 1;
    }
    const r = await approveUnit(root, unit, who, { remote });
    if (r.code === 'ask') {
      console.log(`work approve: ${r.error}; nothing was written. Send this ask to ${r.ask.to ?? 'the owner'}`);
      return 3;
    }
    if (!r.ok) {
      console.error(`work approve: ${r.error}`);
      return 1;
    }
    console.log(`${r.unit}: approved by ${r.by}${r.record ? '' : ' (no record needed)'}`);
    return 0;
  } catch (e) {
    console.error(`work approve: ${(e.stderr?.toString().trim() || e.message).split('\n')[0]}`);
    return 1
  }
}


// `work grant <unit> ...`: issue a grant for a unit; refused when wider than the parent's grant on any dimension, when it carries an always-human
// shape, and for a root grant unless the caller is a listed human.
async function workGrant(args) {
  const [unit, ...rest] = args;
  const flags = {};
  const names = ['scope', 'spend', 'shapes', 'asks', 'data', 'effects', 'to', 'to-kind', 'parent', 'as', 'kind', 'remote'];
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--') || !names.includes(rest[i].slice(2)) || rest[i + 1] === undefined) flags.bad = true;
    else flags[rest[i].slice(2)] = rest[++i];
  }
  if (!unit || unit.startsWith('--') || flags.bad || (flags.kind && !KINDS.includes(flags.kind)) || (flags['to-kind'] && !KINDS.includes(flags['to-kind'])) || Boolean(flags.to) !== Boolean(flags['to-kind'])) {
    console.error(USAGE);
    return 2;
  }
  const parsed = parseGrant(flags);
  if (parsed.error) {
    console.error(`work grant: ${parsed.error}`);
    return 2;
  }
  const root = repoRoot(process.cwd());
  try {
    const issuer = identity(root, { as: flags.as, kind: flags.kind });
    const remote = flags.remote ? remoteOf(root, flags.remote) : undefined;
    if (flags.remote && !remote) {
      console.error(`work grant: no remote ${flags.remote}`);
      return 1;
    }
    const to = flags.to ? { kind: flags['to-kind'], id: workerId(flags.to) } : issuer;
    const r = await issueGrant(root, unit, issuer, { grant: parsed.grant, to, parent: flags.parent, remote, notify: notifier(root), hostDate: await hostDateFor(root, remote ?? remoteOf(root)) });
    if (!r.ok) {
      console.error(`work grant: ${r.error}`);
      return r.code === 'queued' ? 3 : 1;
    }
    console.log(`${r.entry.unit}: grant issued by ${issuer.kind} ${issuer.id} to ${to.kind} ${to.id}, lease to ${r.entry.expires}`);
    return 0;
  } catch (e) {
    console.error(`work grant: ${(e.stderr?.toString().trim() || e.message).split('\n')[0]}`);
    return 1;
  }
}

// `work spend <unit> <amount>`: record spend against the unit's grant and every ancestor's; one that passes a cap parks the unit as a spend ask.
async function workSpend(args) {
  const [unit, amount, ...rest] = args;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (['--as', '--remote'].includes(rest[i]) && rest[i + 1] !== undefined) flags[rest[i].slice(2)] = rest[++i];
    else flags.bad = true;
  }
  if (!unit || unit.startsWith('--') || !/^\d+(\.\d+)?$/.test(amount ?? '') || flags.bad) {
    console.error(USAGE);
    return 2;
  }
  const root = repoRoot(process.cwd());
  try {
    const who = identity(root, { as: flags.as });
    const remote = flags.remote ? remoteOf(root, flags.remote) : undefined;
    const r = await recordSpend(root, unit, who, Number(amount), { remote });
    if (!r.ok) {
      console.error(`work spend: ${r.error}`);
      return r.code === 'spend-cap' ? 3 : 1;
    }
    console.log(`${unit}: ${r.spent} spent`);
    return 0;
  } catch (e) {
    console.error(`work spend: ${(e.stderr?.toString().trim() || e.message).split('\n')[0]}`);
    return 1;
  }
}

// `work grant-check`: exit 1 when a ledger holds an entry that readers ignore for its grant (wider than its parent's, a forged issuer, a root
// grant from anyone but a listed human). Reads the ledgers last seen; writes nothing.
function workGrantCheck() {
  const root = repoRoot(process.cwd());
  const bad = [];
  for (const stem of new Set(planFiles(root).map(stemOf))) for (const i of ledgerView(root, stem).ignored ?? []) if (i.reason.startsWith('grant:')) bad.push(`${stem}: ${i.file}: ${i.reason}`);
  if (bad.length) {
    console.error(`work grant-check: ${bad.length} grant${bad.length === 1 ? '' : 's'} ignored by readers:\n${bad.join('\n')}`);
    return 1;
  }
  console.log("work grant-check: every grant in the ledgers is a subset of its parent's");
  return 0;
}

// `work accept <unit>`: run the unit's Accept on this checkout as a worker who never held it (decision 0172).
async function workAccept(args) {
  const [unit, ...rest] = args;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (!['--reviewer', '--as', '--kind', '--remote'].includes(rest[i]) || rest[i + 1] === undefined) {
      console.error(USAGE);
      return 2;
    }
    flags[rest[i].slice(2)] = rest[++i];
  }
  if (!unit || unit.startsWith('--') || (flags.kind && !KINDS.includes(flags.kind))) {
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
  const r = await acceptUnit(root, unit, who, { reviewer: flags.reviewer, remote: flags.remote ? remoteOf(root, flags.remote) : undefined });
  if (!r.ok) {
    console.error(`work accept: ${r.error}`);
    return r.code === 'author' ? 4 : 1;
  }
  if (r.passed) {
    console.log(`${unit}: accepted by ${who.kind} ${who.id}`);
    return 0;
  }
  console.error(`${unit}: acceptance failed; the unit is not done and returns to its owner\n${r.rec.evidence}`);
  return 1;
}

// `work accept-check`: units marked done whose Accept has no passing acceptance; exit 1 names them (the guardrail's tier-2 check).
function workAcceptCheck() {
  const missing = unaccepted(repoRoot(process.cwd()));
  for (const m of missing) console.error(`${m.unit}: marked done but ${m.why}`);
  if (!missing.length) console.log('work accept-check: every done unit with an Accept has passed it');
  return missing.length ? 1 : 0;
}

// `work escape <unit>`: a defect found at a higher level than the one that merged it raises the audit sampling rate below the finder (0172 item 4).
function workEscape(args) {
  const [unit, ...rest] = args;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    if (!['--merged-at', '--found-at'].includes(rest[i]) || rest[i + 1] === undefined) {
      console.error(USAGE);
      return 2;
    }
    flags[rest[i].slice(2)] = rest[++i];
  }
  if (!unit || !LEVELS.includes(flags['merged-at']) || !LEVELS.includes(flags['found-at'])) {
    console.error(USAGE);
    return 2;
  }
  const r = recordEscape(repoRoot(process.cwd()), { unit, mergedAt: flags['merged-at'], foundAt: flags['found-at'] });
  console.log(r.escape ? `${unit}: an escape; the audit sampling rate at the ${r.raises} level rises. Turn it into a check, guardrail or reviewer instruction (decision 0158 item 3)` : `${unit}: found at or below the level that merged it; not an escape`);
  return 0;
}

export default async function workCommand({ args }) {
  if (['park', 'asks', 'answer'].includes(args[0])) return workAsk(args[0], args.slice(1));
  if (args[0] === 'grant') return workGrant(args.slice(1));
  if (args[0] === 'spend') return workSpend(args.slice(1));
  if (args[0] === 'grant-check') return workGrantCheck();
  if (args[0] === 'next') return workNext(args.slice(1));
  if (args[0] === 'approve') return workApprove(args.slice(1));
  if (args[0] === 'scope-check') return workScopeCheck(args.slice(1));
  if (args[0] === 'request') return workRequest(args.slice(1));
  if (args[0] === 'accept') return workAccept(args.slice(1));
  if (args[0] === 'accept-check') return workAcceptCheck();
  if (args[0] === 'escape') return workEscape(args.slice(1));
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
