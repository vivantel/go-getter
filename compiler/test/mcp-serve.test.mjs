import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { createServer, serve } from '../src/mcp-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'compiler/bin/go-getter.mjs');

const req = (id, method, params) => ({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) });

// Drive `go-getter mcp serve` through a pipe: send the lines, close stdin, return raw stdout lines.
function drive(lines) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'mcp', 'serve'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, lines: out.split('\n').filter(Boolean) }));
    child.stdin.end(lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');
  });
}

test('handshake, ping and an empty tool list', async () => {
  const { code, lines } = await drive([
    req(1, 'initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } }),
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    req(2, 'ping'),
    req(3, 'tools/list'),
  ]);
  assert.equal(code, 0);
  const [init, ping, list] = lines.map((l) => JSON.parse(l));
  assert.equal(init.id, 1);
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.equal(init.result.serverInfo.name, 'go-getter');
  assert.ok(init.result.capabilities.tools);
  assert.deepEqual(ping, { jsonrpc: '2.0', id: 2, result: {} });
  assert.deepEqual(list.result, { tools: [] });
  assert.equal(lines.length, 3, 'the notification gets no reply');
});

test('an unsupported protocol version is answered with one the server speaks', async () => {
  const { lines } = await drive([req(1, 'initialize', { protocolVersion: '1999-01-01' })]);
  assert.match(JSON.parse(lines[0]).result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);
  assert.notEqual(JSON.parse(lines[0]).result.protocolVersion, '1999-01-01');
});

test('unknown method, unknown tool and bad input are answered with errors', async () => {
  const { lines } = await drive([
    req(1, 'resources/list'),
    req(2, 'tools/call', { name: 'nope', arguments: {} }),
    req(3, 'tools/call', {}),
    req(4, 'tools/call', { name: 'nope', arguments: [] }),
    '{not json',
    { jsonrpc: '1.0', id: 5, method: 'ping' },
  ]);
  const r = lines.map((l) => JSON.parse(l));
  assert.deepEqual(r.map((m) => m.error?.code), [-32601, -32602, -32602, -32602, -32700, -32600]);
  assert.equal(r[0].id, 1);
  assert.match(r[1].error.message, /unknown tool: nope/);
  assert.equal(r[4].id, null);
  assert.equal(r[5].id, 5);
});

test('stdout holds only valid JSON-RPC messages', async () => {
  const { lines } = await drive([req(1, 'ping'), '{oops', req(2, 'tools/list'), req(3, 'tools/call', { name: 'x' })]);
  assert.equal(lines.length, 4);
  for (const l of lines) {
    const m = JSON.parse(l);
    assert.equal(m.jsonrpc, '2.0');
    assert.ok('result' in m || 'error' in m);
  }
});

const run = async (args) => {
  const child = spawn(process.execPath, [cli, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  const code = await new Promise((r) => child.on('close', r));
  return { code, out, err };
};

test('an unknown subcommand or argument is a structured error with a help line and exit 2', async () => {
  const bad = await run(['mcp', 'bogus']);
  assert.equal(bad.code, 2);
  assert.match(bad.out, /^error: unknown subcommand "bogus"\nhelp: valid subcommands: serve/);
  const extra = await run(['mcp', 'serve', 'extra']);
  assert.equal(extra.code, 2);
  assert.match(extra.out, /^error: unknown argument "extra".*\nhelp: run `go-getter mcp serve --help`/);
});

test('--help is concise and carries examples, for mcp and for serve', async () => {
  for (const [args, re] of [[['mcp', '--help'], /subcommands:\n  serve/], [['mcp', 'serve', '--help'], /No flags\./], [['mcp', 'serve', '-h'], /No flags\./]]) {
    const { code, out } = await run(args);
    assert.equal(code, 0);
    assert.match(out, re);
    assert.match(out, /examples:/);
    assert.ok(out.split('\n').length < 16);
  }
});

test('no arguments shows bin, description and the live tool state', async () => {
  const { code, out } = await run(['mcp']);
  assert.equal(code, 0);
  const [bin, description, tools, help] = out.trim().split('\n');
  assert.match(bin, /^bin: .*compiler\/bin\/go-getter\.mjs$/);
  assert.match(description, /^description: stdio MCP server/);
  assert.equal(tools, 'tools: 0 declared by the adopted packs (the server runs and lists none)');
  assert.match(help, /^help: Run `go-getter mcp serve`/);
});

test('initialize states the empty list and points to the CLI; with tools it names them', async () => {
  const { lines } = await drive([req(1, 'initialize', {})]);
  const text = JSON.parse(lines[0]).result.instructions;
  assert.match(text, /^0 tools: .*list is empty/);
  assert.match(text, /go-getter plan next/);
  const one = createServer({ tools: [{ name: 'plan_next', description: 'd', inputSchema: {}, handler: () => '' }] });
  const reply = await one.handle(req(1, 'initialize', {}));
  assert.match(reply.result.instructions, /^1 read-only tool, .*: plan_next\./);
});

test('registered tools are listed and called; a failing tool is an isError result', async () => {
  const tools = [
    { name: 'echo', description: 'echo', inputSchema: { type: 'object', properties: {} }, handler: (a) => `got ${JSON.stringify(a)}` },
    { name: 'boom', description: 'fails', inputSchema: { type: 'object' }, handler: () => { throw new Error('bad id'); } },
  ];
  const input = new PassThrough();
  const output = new PassThrough();
  let out = '';
  output.on('data', (d) => (out += d));
  const done = serve({ input, output, tools });
  input.end([req(1, 'tools/list'), req(2, 'tools/call', { name: 'echo', arguments: { id: 7 } }), req(3, 'tools/call', { name: 'boom' })].map((m) => JSON.stringify(m)).join('\n') + '\n');
  await done;
  const [list, echo, boom] = out.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.deepEqual(list.result.tools.map((t) => t.name), ['echo', 'boom']);
  assert.equal(list.result.tools[0].handler, undefined);
  assert.equal(echo.result.content[0].text, 'got {"id":7}');
  assert.deepEqual(boom.result, { content: [{ type: 'text', text: 'bad id' }], isError: true });
});
