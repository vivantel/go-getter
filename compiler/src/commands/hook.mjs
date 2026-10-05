// go-getter hook pre-tool --host <id> [--project <dir>]: tier-2 runtime called by host hooks; reads the tool call on stdin.
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { evaluatePreTool, respond } from '../hook.mjs';

export default function hookCommand({ args }) {
  const [event, ...rest] = args;
  let host;
  let project = process.cwd();
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--host') host = rest[++i];
    else if (rest[i] === '--project') project = path.resolve(rest[++i]);
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
  const out = respond(host, evaluatePreTool(payload.cwd ? path.resolve(payload.cwd) : project, payload));
  if (out.stdout) process.stdout.write(out.stdout);
  if (out.stderr) process.stderr.write(`${out.stderr}\n`);
  return out.code;
}
