// Derived from "handle restricted data only in host agents with a blocking pre-tool hook": every host that has a config in the project
// declares hooks.blockPreTool in its capability file. A host seen in the project without it is not a place for restricted data.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CAPABILITIES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'capabilities');

export default function hostsBlockPreTool({ project, capabilities = CAPABILITIES }) {
  const lacking = [];
  const present = [];
  for (const file of readdirSync(capabilities).filter((f) => f.endsWith('.json')).sort()) {
    const caps = JSON.parse(readFileSync(path.join(capabilities, file), 'utf8'));
    const markers = [caps.hooks?.config, caps.agents?.dir].filter(Boolean);
    if (!markers.some((m) => existsSync(path.join(project, m)))) continue;
    present.push(caps.host);
    if (caps.hooks?.blockPreTool !== true) lacking.push(caps.host);
  }
  return lacking.length ? { ok: false, message: `${lacking.join(', ')} configured here but cannot block a tool call before it runs; keep restricted data out of it` } : { ok: true, message: present.length ? `${present.join(', ')} block before a tool call` : 'no host agent configured' };
}
