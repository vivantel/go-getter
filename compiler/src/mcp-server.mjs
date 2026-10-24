// The stdio MCP server of decision 0139: line-delimited JSON-RPC 2.0, written in-tree (no-runtime-dependencies).
// Tools come from a registry the pack declarations fill; stdout carries protocol messages only.
import { createInterface } from 'node:readline';

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const SERVER_INFO = { name: 'go-getter', version: '0.0.0' };

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const CLI_HINT = 'The same data is available from the CLI: `go-getter plan next`, `go-getter refs`, `go-getter run status`.';

// What the server tells a host on connect: the definitive state of the tool list and where to go next.
export function describeTools(tools) {
  return tools.length
    ? `${tools.length} read-only tool${tools.length === 1 ? '' : 's'}, from the packs this project adopted: ${tools.map((t) => t.name).join(', ')}. Each returns what its CLI verb prints. ${CLI_HINT}`
    : `0 tools: none of the packs this project adopted declares an MCP tool, so the server is working and the list is empty. ${CLI_HINT}`;
}

const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const ok = (id, result) => ({ jsonrpc: '2.0', id, result });
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A registry tool is { name, description, inputSchema, handler(args) -> string | { text } }; the registry is a list of them.
export function createServer({ tools = [], version = SERVER_INFO.version } = {}) {
  const byName = new Map(tools.map((t) => [t.name, t]));

  async function callTool(id, params) {
    if (!isObject(params) || typeof params.name !== 'string') return fail(id, INVALID_PARAMS, 'tools/call needs a tool name');
    if (params.arguments !== undefined && !isObject(params.arguments)) return fail(id, INVALID_PARAMS, 'tool arguments must be an object');
    const tool = byName.get(params.name);
    if (!tool) return fail(id, INVALID_PARAMS, `unknown tool: ${params.name}`);
    try {
      const out = await tool.handler(params.arguments ?? {});
      return ok(id, { content: [{ type: 'text', text: typeof out === 'string' ? out : String(out?.text ?? '') }] });
    } catch (err) {
      return ok(id, { content: [{ type: 'text', text: err.message }], isError: true });
    }
  }

  // The reply to one parsed message, or null when none is due (a notification).
  async function handle(msg) {
    if (!isObject(msg) || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return fail(isObject(msg) && ['string', 'number'].includes(typeof msg.id) ? msg.id : null, INVALID_REQUEST, 'not a JSON-RPC 2.0 request');
    }
    const hasId = 'id' in msg;
    if (hasId && !['string', 'number'].includes(typeof msg.id)) return fail(null, INVALID_REQUEST, 'id must be a string or a number');
    if (!hasId) return null;
    const { id, params } = msg;
    switch (msg.method) {
      case 'initialize': {
        const asked = isObject(params) ? params.protocolVersion : undefined;
        return ok(id, {
          protocolVersion: PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { ...SERVER_INFO, version },
          instructions: describeTools(tools),
        });
      }
      case 'ping':
        return ok(id, {});
      case 'tools/list':
        return ok(id, { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case 'tools/call':
        return callTool(id, params);
      default:
        return fail(id, METHOD_NOT_FOUND, `method not found: ${msg.method}`);
    }
  }

  // The reply line for one input line, or null when none is due.
  async function handleLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return JSON.stringify(fail(null, PARSE_ERROR, 'parse error'));
    }
    try {
      const reply = await handle(msg);
      return reply ? JSON.stringify(reply) : null;
    } catch (err) {
      return JSON.stringify(fail(isObject(msg) ? msg.id ?? null : null, INTERNAL_ERROR, err.message));
    }
  }

  return { handle, handleLine };
}

// Serve until input ends. Replies are written in request order; nothing else is written to `output`.
export async function serve({ input = process.stdin, output = process.stdout, tools = [], version } = {}) {
  const server = createServer({ tools, version });
  let queue = Promise.resolve();
  const lines = createInterface({ input, crlfDelay: Infinity });
  lines.on('line', (line) => {
    if (!line.trim()) return;
    queue = queue.then(async () => {
      const reply = await server.handleLine(line);
      if (reply) output.write(`${reply}\n`);
    });
  });
  await new Promise((resolve) => lines.once('close', resolve));
  await queue;
}
