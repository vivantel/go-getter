// Derived from "handle restricted data only in host agents with a blocking pre-tool hook": every host that has a config in the project
// must declare hooks.blockPreTool in its capability file AND have go-getter's pre-tool hook installed in the hook file that file names.
// A host seen in the project without either is not a place for restricted data.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasPreToolHook } from '../../hosts/hook-events.mjs';

const CAPABILITIES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'capabilities');

export default function hostsBlockPreTool({ project, capabilities = CAPABILITIES }) {
  const lacking = [];
  const unhooked = [];
  const present = [];
  for (const file of readdirSync(capabilities).filter((f) => f.endsWith('.json')).sort()) {
    const caps = JSON.parse(readFileSync(path.join(capabilities, file), 'utf8'));
    const markers = [caps.hooks?.config, caps.agents?.dir].filter(Boolean);
    if (!markers.some((m) => existsSync(path.join(project, m)))) continue;
    present.push(caps.host);
    if (caps.hooks?.blockPreTool !== true) lacking.push(caps.host);
    else if (!caps.hooks.config || !hasPreToolHook(project, caps.hooks.config)) unhooked.push(`${caps.host} (${caps.hooks.config})`);
  }
  if (unhooked.length) return { ok: false, message: `${unhooked.join(', ')} configured here but no go-getter pre-tool hook is installed, so nothing blocks a tool call before it runs; run go-getter apply` };
  return lacking.length ? { ok: false, message: `${lacking.join(', ')} configured here but cannot block a tool call before it runs; keep restricted data out of it` } : { ok: true, message: present.length ? `${present.join(', ')} block before a tool call` : 'no host agent configured' };
}
