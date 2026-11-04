// OpenCode host adapter (plan host-adapters H3). OpenCode documents no way for a plugin to replace tool output (fact 0005),
// so it has no `respondPostTool`.
import { forkAdapter } from './fork-base.mjs';

export default forkAdapter({ host: 'opencode', root: '.opencode', pluginFile: '.opencode/plugins/go-getter.js' });
