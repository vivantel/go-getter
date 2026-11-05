// Shared base of the OpenCode and Kilo adapters (plan host-adapters H3, fact 0005): Kilo Code CLI is a fork of OpenCode, and
// their agent files differ only in the directory, which the capability matrix holds. Plain data in and out (decision 0119).
import { md } from './agent-format.mjs';

// { host, root, pluginFile, extra } -> an adapter. `extra` adds or overrides operations the fork's host alone has.
export function forkAdapter({ host, root, pluginFile, extra = {} }) {
  return {
    describe: () => ({ host, kind: 'adapter', hookFile: null, instructionFile: null, selfPlugin: false, owned: [`${root}/agents/`, pluginFile], shared: [] }),

    // { roster, role, route, capabilities } -> { content }. `route` is the cost-routing default { model, provider, effort } or null.
    agent({ roster, role, route, capabilities }) {
      if (!capabilities?.agents) return { missing: 'agents' };
      const head = { description: role.description, mode: 'subagent', ...(route ? { model: `${route.provider}/${route.model}` } : {}) };
      const permission = role.access === 'read-only' ? '\npermission:\n  edit: deny\n  bash: deny' : '';
      return { content: md(head, roster, role, permission) };
    },

    // The plugin file and hook answers stay with the core until a later step moves them; the core keeps its own code.
    hookSettings: () => ({ missing: 'hookSettings' }),
    projectFiles: () => ({ outputs: {} }),
    respond: () => ({ missing: 'respond' }),
    respondPostTool: () => ({ missing: 'respondPostTool' }),
    ...extra,
  };
}
