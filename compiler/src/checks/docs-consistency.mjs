// Host capability has one source, compiler/capabilities/*.json (plan enforcement-hardening H9, measures M3 and M4). This check
// compares fact 0009's tier matrix and output-replacement row with those files, and the README coverage table with the
// `go-getter coverage` rows of this repository. Each disagreement is one problem.
import path from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { loadCapabilities, HOSTS } from '../capabilities.mjs';
import { loadPack } from '../packs.mjs';
import { coverage } from '../coverage.mjs';
import { coverageMarkdown, marksFor } from '../coverage-table.mjs';
import { deferredHosts } from '../hosts/registry.mjs';

const FACT = 'docs/facts/0009-host-capability-matrix.md';
const cells = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function readPacks(root) {
  const dir = path.join(root, 'src/packs');
  const packs = {};
  for (const name of existsSync(dir) ? readdirSync(dir) : []) {
    const file = path.join(dir, name, 'pack.json');
    if (existsSync(file)) packs[name] = loadPack(file);
  }
  return packs;
}

// Fact 0009 against the capability files: the tier matrix, and which hosts replace tool output.
export function factProblems(root, caps = loadCapabilities(root)) {
  const problems = [];
  const lines = readFileSync(path.join(root, FACT), 'utf8').split('\n');
  for (const line of lines) {
    const row = cells(line);
    const m = /^(\d+) /.exec(row[0] ?? '');
    if (m && row.length === HOSTS.length + 1) {
      HOSTS.forEach((h, i) => {
        const claimed = /^[0-9–-]/.exec(row[i + 1])?.[0];
        const tier = caps[h].tiers[m[1]];
        const actual = tier ? String(tier) : '–';
        if (claimed !== undefined && claimed.replace('-', '–') !== actual) problems.push(`fact 0009 component ${m[1]} on ${h}: tier ${claimed}, capability file says ${actual}`);
      });
    }
    if (row[0] === 'Replace tool output') {
      HOSTS.forEach((h, i) => {
        const text = row[i + 1];
        const only = /only/.test(text);
        const replaces = !/^(\?|no\b)/.test(text) && !only;
        const actual = caps[h].hooks.rewriteOutput === true;
        if (actual && !replaces) problems.push(`fact 0009 "Replace tool output" on ${h}: "${text}", capability file sets rewriteOutput: true`);
        if (!actual && replaces) problems.push(`fact 0009 "Replace tool output" on ${h}: "${text}", capability file sets rewriteOutput: false`);
        if (only && caps[h].hooks.rewriteMcpOutput !== true) problems.push(`fact 0009 "Replace tool output" on ${h}: "${text}", capability file sets no rewriteMcpOutput`);
      });
    }
  }
  return problems;
}

// The README coverage table against what `go-getter coverage` prints for this repository, cell by cell.
export function readmeProblems(root, caps = loadCapabilities(root)) {
  const problems = [];
  const lines = readFileSync(path.join(root, 'README.md'), 'utf8').split('\n');
  const start = lines.findIndex((l) => l.startsWith('| Component | Pack |'));
  if (start < 0) return ['README.md has no coverage table (a header row starting "| Component | Pack |")'];
  let end = start;
  while (lines[end + 1]?.startsWith('|')) end++;
  const have = lines.slice(start, end + 1);
  const want = coverageMarkdown(coverage(root, readPacks(root), caps), HOSTS, caps, deferredHosts());
  if (have.length !== want.length) problems.push(`README coverage table has ${have.length} rows, coverage has ${want.length}`);
  for (let i = 0; i < Math.min(have.length, want.length); i++) {
    if (have[i] === want[i]) continue;
    const a = cells(have[i]);
    const b = cells(want[i]);
    b.forEach((cell, j) => {
      if (a[j] === cell) return;
      const host = j >= 2 ? HOSTS[j - 2] : null;
      const marked = host && marksFor(host, parseInt(b[0], 10), caps).length && a[j] === cell.split(' (')[0];
      problems.push(`README coverage ${b[0] || 'header'} ${host ?? (j ? 'packs' : 'component')}: README "${a[j]}", coverage "${cell}"${marked ? ' (unmarked)' : ''}`);
    });
  }
  return problems;
}

export function docsConsistencyProblems(root) {
  const caps = loadCapabilities(root);
  return [...factProblems(root, caps), ...readmeProblems(root, caps)];
}

export default function checkDocsConsistency({ args }) {
  const root = args.includes('--project') ? path.resolve(args[args.indexOf('--project') + 1]) : process.cwd();
  const problems = docsConsistencyProblems(root);
  if (problems.length) {
    console.error(`check docs-consistency: ${problems.length} problem(s)`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log('check docs-consistency: ok');
  return 0;
}
