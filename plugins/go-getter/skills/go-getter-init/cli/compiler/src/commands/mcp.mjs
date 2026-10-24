// go-getter mcp serve: a stdio MCP server for the project's adopted pack tools (decision 0139).
// Output of the command itself follows the AXI conventions (home view, error:/help: lines, exit 2 for usage); `serve` keeps stdout for the protocol.
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve } from '../mcp-server.mjs';

const DESCRIPTION = 'stdio MCP server exposing the read-only verbs of the packs this project adopted';

const HELP = {
  mcp: `usage: go-getter mcp <subcommand>

subcommands:
  serve    run the stdio MCP server (JSON-RPC on stdin and stdout)

examples:
  go-getter mcp            show the tools the adopted packs declare
  go-getter mcp serve      start the server; a host spawns this
  go-getter mcp serve --help`,
  serve: `usage: go-getter mcp serve

Runs the MCP server on stdio until stdin closes. No flags. Stdout carries protocol messages only; logs go to stderr.

examples:
  go-getter mcp serve
  printf '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\\n' | go-getter mcp serve`,
};

// The tools of the adopted packs; the pack declarations that fill this arrive with the next plan step.
const loadTools = () => [];

const tilde = (p) => (p.startsWith(os.homedir() + path.sep) ? `~${p.slice(os.homedir().length)}` : p);

function homeView(root, tools) {
  return [
    `bin: ${tilde(path.join(root, 'compiler/bin/go-getter.mjs'))}`,
    `description: ${DESCRIPTION}`,
    tools.length ? `tools: ${tools.length} declared by the adopted packs (${tools.map((t) => t.name).join(', ')})` : 'tools: 0 declared by the adopted packs (the server runs and lists none)',
    'help: Run `go-getter mcp serve` to start the server; a host spawns it, see `go-getter mcp serve --help`',
  ].join('\n');
}

const usageError = (message, help) => {
  console.log(`error: ${message}\nhelp: ${help}`);
  return 2;
};

export default async function mcpCommand({ root, args }) {
  const [sub, ...rest] = args;
  const wantsHelp = args.includes('--help') || args.includes('-h');
  if (!sub) return console.log(homeView(root, loadTools())) ?? 0;
  if (sub !== 'serve' && !wantsHelp) return usageError(`unknown subcommand "${sub}"`, 'valid subcommands: serve; run `go-getter mcp --help`');
  if (wantsHelp) {
    console.log(HELP[sub === 'serve' ? 'serve' : 'mcp']);
    return 0;
  }
  if (rest.length) return usageError(`unknown argument "${rest[0]}" for serve (it takes none)`, 'run `go-getter mcp serve --help`');
  // Stdout is the protocol stream: anything a verb prints must not reach it.
  console.log = console.error;
  const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  await serve({ tools: loadTools(), version });
  return 0;
}
