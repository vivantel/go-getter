#!/usr/bin/env node
// go-getter CLI. Each command is a module under compiler/src/commands/ or compiler/src/checks/;
// commands not implemented yet report so and exit 0, so npm scripts stay wired from day one.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const [command, ...args] = process.argv.slice(2);

async function run(modulePath, label, rest) {
  const file = path.join(root, modulePath);
  if (!existsSync(file)) {
    console.log(`go-getter ${label}: not yet implemented`);
    return 0;
  }
  const mod = await import(file);
  return (await mod.default({ root, args: rest })) ?? 0;
}

async function main() {
  switch (command) {
    case undefined:
    case '--help':
    case 'help':
      console.log('usage: go-getter <build|check <name>|detect|render-pack|apply|route|verify|eval> [args]');
      return 0;
    case 'check': {
      const [name, ...rest] = args;
      if (!name) {
        console.error('usage: go-getter check <name>');
        return 2;
      }
      return run(`compiler/src/checks/${name}.mjs`, `check ${name}`, rest);
    }
    default:
      return run(`compiler/src/commands/${command}.mjs`, command, args);
  }
}

process.exitCode = await main();
