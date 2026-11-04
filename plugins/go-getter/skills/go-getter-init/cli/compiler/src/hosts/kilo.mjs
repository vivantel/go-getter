// Kilo Code CLI host adapter (plan host-adapters H3). What differs from OpenCode lives here: the plugin directory
// `.kilo/plugin/` (fact 0031), the plugin that sets `output.output` from `{ output }` (fact 0031), and the `question` tool,
// which the client gates (fact 0034).
import { forkAdapter } from './fork-base.mjs';

export const QUESTION_TOOL = { name: 'question', enabledClients: ['app', 'cli', 'desktop', 'vscode'], otherwise: 'KILO_ENABLE_QUESTION_TOOL' };

export default forkAdapter({
  host: 'kilo',
  root: '.kilo',
  pluginFile: '.kilo/plugin/go-getter.js',
  extra: {
    // { result: { mcp, output } } -> { answer }: the plugin sets `output.output` from `{ output }`.
    respondPostTool: ({ result }) => ({ answer: { code: 0, stdout: JSON.stringify({ output: typeof result.output === 'string' ? result.output : JSON.stringify(result.output) }), stderr: '' } }),
  },
});
