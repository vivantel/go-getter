// go-getter hook pre-tool --host <id> [--project <dir>]: tier-2 runtime called by host hooks; reads the tool call on stdin.
// go-getter hook session-start --host <id>: prints the vendored capture/lint nudges (never blocks).
// pre-tool also routes delegations to a role (cost-routing pack): it sets the delegated model, or denies when no model is eligible.
// go-getter hook stop --host <id>: verification gate; blocks "done" while the adopted checks fail (bounded, then a human).
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { evaluatePreTool, respond, sessionNudges, hookRecord } from '../hook.mjs';
import { recordQuietly } from '../telemetry/record.mjs';
import { evaluateStop, respondStop } from '../verify.mjs';
import { routeDelegation, routeRecord, respondRewrite } from '../routing/delegate.mjs';

export default async function hookCommand({ root, args }) {
  const [event, ...rest] = args;
  let host;
  let project = process.cwd();
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--host') host = rest[++i];
    else if (rest[i] === '--project') project = path.resolve(rest[++i]);
  }
  if (event === 'session-start') {
    recordQuietly(project, hookRecord('session-start', host, {}));
    const text = sessionNudges(root, project);
    if (text) process.stdout.write(`${text}\n`);
    return 0;
  }
  if (!['pre-tool', 'stop'].includes(event) || !host) {
    console.error('usage: go-getter hook <pre-tool|stop|session-start> --host <id>');
    return 0; // never block on a misconfigured hook
  }
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return 0;
  }
  const dir = payload.cwd ? path.resolve(payload.cwd) : project;
  if (event === 'stop') {
    let out;
    try {
      out = respondStop(host, await evaluateStop(dir, payload, { host }));
    } catch {
      return 0; // a broken gate must never trap a session
    }
    if (out.stdout) process.stdout.write(out.stdout);
    if (out.stderr) process.stderr.write(`${out.stderr}\n`);
    return out.code;
  }
  const decision = evaluatePreTool(dir, payload);
  recordQuietly(dir, hookRecord('pre-tool', host, payload, decision));
  if (!decision.deny) {
    let routed = null;
    try {
      routed = routeDelegation(dir, host, payload);
    } catch {
      // routing is an optimisation: a failure leaves the delegation as it was
    }
    if (routed?.route) recordQuietly(dir, routeRecord(host, routed.route, routed.handoffTokens));
    if (routed?.deny) {
      decision.deny = true;
      decision.reason = routed.reason;
    } else if (routed?.advisory) {
      process.stderr.write(`${routed.advisory}\n`);
    } else if (routed?.rewrite) {
      const rewritten = respondRewrite(host, routed.rewrite);
      process.stdout.write(rewritten.stdout);
      return rewritten.code;
    }
  }
  const out = respond(host, decision);
  if (out.stdout) process.stdout.write(out.stdout);
  if (out.stderr) process.stderr.write(`${out.stderr}\n`);
  return out.code;
}
