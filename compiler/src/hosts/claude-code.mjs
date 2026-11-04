// Claude Code host adapter (plan host-adapters H2, decisions 0118 and 0119). Every operation takes and returns plain data:
// no callbacks, no shared state. An operation the adapter cannot do answers `{ missing: <capability> }`, never a guess.
import { md } from './agent-format.mjs';
import { setEvent } from './hook-events.mjs';

const HOOK_FILE = '.claude/settings.json';
const READ_ONLY_TOOLS = 'Read, Grep, Glob';

export default {
  describe: () => ({ host: 'claude-code', kind: 'adapter', hookFile: HOOK_FILE, instructionFile: 'CLAUDE.md', selfPlugin: true, owned: ['.claude/agents/', HOOK_FILE, 'CLAUDE.md'], shared: [HOOK_FILE] }),

  // { roster, role, route, capabilities } -> { content }. `route` is the cost-routing default { model, effort } or null.
  agent({ roster, role, route, capabilities }) {
    if (!capabilities?.agents) return { missing: 'agents' };
    const head = { name: role.id, description: role.description, ...(route ? { model: route.model, ...(route.effort ? { effort: route.effort } : {}) } : {}), ...(role.access === 'read-only' ? { tools: READ_ONLY_TOOLS } : {}) };
    return { content: md(head, roster, role) };
  },

  // { current, plugin, events: { preTool, postTool, sessionStart, sessionEnd, stop } } -> { file, config }.
  // `current` is the parsed settings file; each event is go-getter's hook entry or null (remove it).
  hookSettings({ current, plugin, events }) {
    // The marketplace is pinned to the release tag of the CLI that wrote it; other plugins and marketplaces are kept.
    const withPlugin = !plugin ? current : {
      ...current,
      extraKnownMarketplaces: { ...current.extraKnownMarketplaces, [plugin.marketplace]: { source: { source: 'github', repo: plugin.repo, ref: `v${plugin.version}` } } },
      enabledPlugins: { ...current.enabledPlugins, [`go-getter@${plugin.marketplace}`]: true },
    };
    const list = [
      [['hooks', 'PreToolUse'], events.preTool],
      [['hooks', 'PostToolUse'], events.postTool],
      [['hooks', 'SessionStart'], events.sessionStart],
      [['hooks', 'SessionEnd'], events.sessionEnd],
      [['hooks', 'Stop'], events.stop],
    ];
    return { file: HOOK_FILE, config: list.reduce((acc, [keys, entry]) => setEvent(acc, keys, entry), withPlugin) };
  },

  // { instructionFileKept } -> { outputs }: CLAUDE.md points at AGENTS.md unless the project keeps its own regular file.
  projectFiles: ({ instructionFileKept }) => ({ outputs: instructionFileKept ? {} : { 'CLAUDE.md': { symlink: 'AGENTS.md' } } }),

  // { decision: { ask, deny, reason } } -> { answer: { code, stdout, stderr } }.
  respond({ decision }) {
    if (decision.ask) {
      return { answer: { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: decision.reason } }), stderr: '' } };
    }
    if (!decision.deny) return { answer: { code: 0, stdout: '', stderr: '' } };
    return { answer: { code: 2, stdout: '', stderr: decision.reason } };
  },

  // { result: { mcp, output } } -> { answer }: the result is replaced in place (fact 0031).
  respondPostTool({ result }) {
    const key = result.mcp ? 'updatedMCPToolOutput' : 'updatedToolOutput';
    return { answer: { code: 0, stdout: JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', [key]: result.output } }), stderr: '' } };
  },
};
