// go-getter coverage [--project <dir>] [--pack-dir <dir>] [--json]
import path from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { loadPack } from '../packs.mjs';
import { loadCapabilities } from '../capabilities.mjs';
import { coverage, formatCoverage } from '../coverage.mjs';

export default function coverageCommand({ root, args }) {
  let project = process.cwd();
  let packDir = path.join(root, 'src/packs');
  let asJson = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--project') project = path.resolve(args[++i]);
    else if (args[i] === '--pack-dir') packDir = path.resolve(args[++i]);
    else if (args[i] === '--json') asJson = true;
  }
  const packs = {};
  for (const name of existsSync(packDir) ? readdirSync(packDir) : []) {
    const file = path.join(packDir, name, 'pack.json');
    if (existsSync(file)) packs[name] = loadPack(file);
  }
  const rows = coverage(project, packs, loadCapabilities(root));
  console.log(asJson ? JSON.stringify(rows, null, 2) : formatCoverage(rows));
  return 0;
}
