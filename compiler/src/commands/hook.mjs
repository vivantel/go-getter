// go-getter hook pre-tool --host <id> [--project <dir>]: tier-2 runtime called by host hooks; reads the tool call on stdin.
// go-getter hook session-start --host <id>: prints the vendored kms capture/lint nudges (never blocks).
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { evaluatePreTool, respond, sessionNudges, hookRecord } from '../hook.mjs';
import { recordQuietly } from '../telemetry/record.mjs';

export default function hookCommand({ root, args }) {
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
  if (event !== 'pre-tool' || !host) {
    console.error('usage: go-getter hook pre-tool --host <id>');
    return 0; // never block on a misconfigured hook
  }
  let payload = {};
  try {
    payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return 0;
  }
  const dir = payload.cwd ? path.resolve(payload.cwd) : project;
  const decision = evaluatePreTool(dir, payload);
  recordQuietly(dir, hookRecord('pre-tool', host, payload, decision));
  const out = respond(host, decision);
  if (out.stdout) process.stdout.write(out.stdout);
  if (out.stderr) process.stderr.write(`${out.stderr}\n`);
  return out.code;
}
