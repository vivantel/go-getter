// go-getter ship [--title <type: summary>] [--why <intent>] [--allow-no-ci] [--dry-run] [--check <command>] [--no-conform] [--no-review] [--interval <s>] [--timeout <min>] [--project <dir>]
// Commit to merge in one deterministic command (decisions 0157, 0163): checks, message with Refs, push, pull request, CI, squash merge on green.
// `go-getter pr` is the same without the merge; both live here so the options stay one list.
import path from 'node:path';
import { ship, openPr, ShipError, claudeReview, claudeConform, defaultRunner } from '../ship.mjs';
import { modelGatePolicy } from '../gate-defaults.mjs';
import { repoRoot } from '../plan.mjs';

const SHIP_USAGE = 'usage: go-getter ship [--title "type: summary"] [--why "<intent>"] [--allow-no-ci] [--dry-run] [--check <command>] [--no-conform] [--no-review] [--interval <seconds>] [--timeout <minutes>] [--project <dir>]';
const PR_USAGE = 'usage: go-getter pr [--title "type: summary"] [--why "<intent>"] [--dry-run] [--check <command>] [--no-conform] [--no-review] [--interval <seconds>] [--timeout <minutes>] [--project <dir>]';
const VALUE = ['--check', '--title', '--why', '--interval', '--timeout', '--project'];

// The conform and reviewer gates are on by default (decision 0158). A model call needs the project's answers to allow one
// (governance, then the spend cap) and the claude CLI on PATH; otherwise the gate is recorded `skipped: <reason>` and the
// stack goes on, so CI and machines with no model still ship. `--no-conform` / `--no-review` turn a gate off.
export function modelGates(project, on, run = defaultRunner) {
  const out = {};
  const want = Object.entries(on).filter(([, v]) => v === true || v === 'auto').map(([k]) => k);
  for (const [gate, v] of Object.entries(on)) if (!want.includes(gate)) out[gate] = { skip: v === 'env' ? 'turned off (GO_GETTER_SHIP_GATES=off)' : `turned off (--no-${gate})` };
  if (!want.length) return out;
  const policy = modelGatePolicy(project);
  const missing = policy.ok && run('claude', ['--version'], { cwd: project }).code === 127;
  const reason = !policy.ok ? policy.reason : missing ? 'claude CLI not on PATH' : null;
  for (const gate of want) {
    if (reason) out[gate] = { skip: reason };
    else out[gate] = (gate === 'review' ? claudeReview : claudeConform)(project, run, policy.budgetUsd);
  }
  return out;
}

export async function runVerb(verb, args) {
  const USAGE = verb === 'pr' ? PR_USAGE : SHIP_USAGE;
  const opts = {};
  let project = process.cwd();
  // 'auto' = on by default (decision 0158); GO_GETTER_SHIP_GATES=off makes the default off, for machines and tests with no model.
  const dflt = process.env.GO_GETTER_SHIP_GATES === 'off' ? 'env' : 'auto';
  let reviewOn = dflt;
  let conformOn = dflt;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (VALUE.includes(a)) {
      if (args[i + 1] === undefined || args[i + 1].startsWith('--')) {
        console.error(USAGE);
        return 2;
      }
      const v = args[++i];
      if (a === '--check') opts.check = v;
      else if (a === '--title') opts.title = v;
      else if (a === '--why') opts.why = v;
      else if (a === '--project') project = path.resolve(v);
      else if (!(Number(v) >= 0)) {
        console.error(USAGE);
        return 2;
      } else if (a === '--interval') opts.intervalMs = Number(v) * 1000;
      else opts.timeoutMs = Number(v) * 60_000;
    } else if (a === '--allow-no-ci' && verb === 'ship') opts.allowNoCi = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--review') reviewOn = true;
    else if (a === '--conform') conformOn = true;
    else if (a === '--no-review') reviewOn = false;
    else if (a === '--no-conform') conformOn = false;
    else {
      console.error(USAGE);
      return 2;
    }
  }
  Object.assign(opts, modelGates(repoRoot(project), { conform: conformOn, review: reviewOn }));
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
