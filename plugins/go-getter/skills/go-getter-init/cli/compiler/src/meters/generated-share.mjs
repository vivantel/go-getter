#!/usr/bin/env node
// Reader for the meter docs/meters/generated-share.md (plan paper-instruments, step P5).
// Prints one number in 0..1 (`--share derived|advisory`) or the raw counts as JSON (`--counts`), counted from the git tree of a ref (default HEAD),
// never from the working tree: the live top-level docs/guardrails/*.md, excluding archive/ and INDEX.md.
import { execFileSync } from 'node:child_process';
import { parseFrontmatter } from '../frontmatter.mjs';
import { cleanGitEnv } from '../git-env.mjs';

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: cleanGitEnv(process.env), stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });

// A guardrail is advisory-only when it has at least one enforcement entry and every entry has tier 1.
export function generatedShare(root, ref = 'HEAD') {
  const files = git(root, ['ls-tree', '--name-only', ref, 'docs/guardrails/'])
    .split('\n')
    .filter((f) => /^docs\/guardrails\/[^/]+\.md$/.test(f) && f !== 'docs/guardrails/INDEX.md');
  let entries = 0;
  let derived = 0;
  let advisory = 0;
  for (const f of files) {
    const list = parseFrontmatter(git(root, ['show', `${ref}:${f}`])).data['go-getter']?.enforcement ?? [];
    entries += list.length;
    derived += list.filter((e) => e.origin === 'derived').length;
    if (list.length && list.every((e) => Number(e.tier) === 1)) advisory += 1;
  }
  return { derived, entries, advisory, guardrails: files.length };
}

const round = (n, d) => Number((n / d).toFixed(6));

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);
  const c = generatedShare(process.cwd(), arg('--ref') ?? 'HEAD');
  if (process.argv.includes('--counts')) console.log(JSON.stringify(c));
  else {
    const [num, den] = { derived: [c.derived, c.entries], advisory: [c.advisory, c.guardrails] }[arg('--share')] ?? [];
    if (num === undefined || !den) {
      console.error(den === 0 ? 'denominator is 0: no reading' : 'usage: generated-share.mjs --share derived|advisory | --counts [--ref <ref>]');
      process.exit(1);
    }
    console.log(round(num, den));
  }
}
