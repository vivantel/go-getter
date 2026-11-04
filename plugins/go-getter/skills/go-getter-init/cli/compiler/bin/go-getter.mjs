#!/usr/bin/env node
// go-getter CLI. Each command is a module under compiler/src/commands/ or compiler/src/checks/, listed in
// compiler/src/command-table.mjs. An unknown command or check name exits 2, so a step whose Check names a verb
// that does not exist yet cannot pass.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { isCommand, usageLine } from '../src/command-table.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [command, ...args] = process.argv.slice(2);

const checkNames = () => readdirSync(path.join(root, 'compiler/src/checks')).filter((f) => f.endsWith('.mjs')).map((f) => f.slice(0, -4)).sort();

async function run(modulePath, label, rest) {
  const file = path.join(root, modulePath);
  if (!modulePath || !existsSync(file)) {
    console.error(`go-getter: unknown ${label.startsWith('check ') ? 'check' : 'command'} "${label.replace(/^check /, '')}"`);
    console.error(label.startsWith('check ') ? `checks: ${checkNames().join(', ')}` : usageLine());
    return 2;
  }
  const mod = await import(file);
  return (await mod.default({ root, args: rest })) ?? 0;
}

async function main() {
  switch (command) {
    case undefined:
    case '--help':
    case 'help':
      console.log(usageLine());
      return 0;
    case 'check': {
      const [name, ...rest] = args;
      if (!name || name.startsWith('--')) return run('compiler/src/commands/check.mjs', 'check', args);
      return run(checkNames().includes(name) ? `compiler/src/checks/${name}.mjs` : '', `check ${name}`, rest);
    }
    default:
      if (!isCommand(command)) {
        console.error(`go-getter: unknown command "${command}"`);
        console.error(usageLine());
        return 2;
      }
      return run(`compiler/src/commands/${command}.mjs`, command, args);
  }
}

process.exitCode = await main();

// Every verb renews the caller's claims that are under half their lease (decision 0166 item 2); never fails the verb, never runs
// from go-getter's own pushes.
if (command && command !== 'work' && isCommand(command)) {
  try {
    const { readRecord } = await import('../src/work/ledger.mjs');
    if (Object.keys(readRecord(process.cwd()).claims ?? {}).length) await (await import('../src/work/ops.mjs')).renewAll(process.cwd());
  } catch {
    // renewal is best effort
  }
}
