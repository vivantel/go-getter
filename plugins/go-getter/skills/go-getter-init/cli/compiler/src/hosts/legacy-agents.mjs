// Agent-file renderers of the hosts that have no adapter module yet; the wrapper adapter calls them unchanged.
import { md, roleBody, tag } from './agent-format.mjs';

// Read-only roles get these on hosts with tool lists (names are host-native; unconfirmed ones are noted in fact 0015).
const READ_ONLY_TOOLS = {
  'gemini-cli': ['read_file', 'list_directory', 'glob', 'grep_search'],
  copilot: ['read', 'search'],
};
const yamlList = (items) => `[${items.map((i) => JSON.stringify(i)).join(', ')}]`;

// One renderer per host: (roster, role, route) -> file content. `route` is the cost-routing default { model, provider, effort } or null.
export const RENDER = {
  cursor: (r, role, route) => md({ name: role.id, description: role.description, ...(route ? { model: route.effort ? `${route.model}[effort=${route.effort}]` : route.model } : {}), ...(role.access === 'read-only' ? { readonly: true } : {}) }, r, role),
  'gemini-cli': (r, role, route) => md({ name: role.id, description: role.description, kind: 'local', ...(route ? { model: route.model } : {}) }, r, role, role.access === 'read-only' ? `\ntools: ${yamlList(READ_ONLY_TOOLS['gemini-cli'])}` : ''),
  copilot: (r, role) => md({ name: role.id, description: role.description }, r, role, role.access === 'read-only' ? `\ntools: ${yamlList(READ_ONLY_TOOLS.copilot)}` : ''),
  codex: (r, role, route) =>
    [
      `# ${tag(r, role)}`,
      `name = ${JSON.stringify(role.id)}`,
      `description = ${JSON.stringify(role.description)}`,
      ...(route ? [`model = ${JSON.stringify(route.model)}`, ...(route.effort ? [`model_reasoning_effort = ${JSON.stringify(route.effort)}`] : [])] : []),
      `sandbox_mode = ${JSON.stringify(role.access === 'read-only' ? 'read-only' : 'workspace-write')}`,
      `developer_instructions = ${JSON.stringify(roleBody(r, role))}`,
      '',
    ].join('\n'),
};
