// Wrapper adapter: puts a host that has no adapter module yet behind the registry without changing its output. Agent files
// come from today's renderers; every other operation answers `missing`, so the core keeps using its own per-host code for it.
import { RENDER } from './legacy-agents.mjs';

export function wrapperAdapter(host) {
  return {
    describe: () => ({ host, kind: 'wrapper', hookFile: null, instructionFile: null, selfPlugin: false, owned: [], shared: [] }),
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
