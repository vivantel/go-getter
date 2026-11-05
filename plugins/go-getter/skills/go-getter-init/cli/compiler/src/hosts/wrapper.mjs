// Wrapper adapter: puts a host that has no adapter module yet behind the registry without changing its output. Agent files
// come from today's renderers; every other operation answers `missing`, so the core keeps using its own per-host code for it.
import { RENDER } from './legacy-agents.mjs';

// `status` is 'deferred' for a host whose integration shapes are not all confirmed; it is reported, never acted on.
export function wrapperAdapter(host, status = null) {
  return {
    describe: () => ({ host, kind: 'wrapper', ...(status ? { status } : {}), hookFile: null, instructionFile: null, selfPlugin: false, owned: [], shared: [] }),
    agent({ roster, role, route, capabilities }) {
      if (!capabilities?.agents || !RENDER[host]) return { missing: 'agents' };
      return { content: RENDER[host](roster, role, route) };
    },
    hookSettings: () => ({ missing: 'hookSettings' }),
    projectFiles: () => ({ outputs: {} }),
    respond: () => ({ missing: 'respond' }),
    respondPostTool: () => ({ missing: 'respondPostTool' }),
  };
}
