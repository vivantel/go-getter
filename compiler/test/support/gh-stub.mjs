// A stand-in for the `gh` CLI in tests: `installGh(dir, data)` writes an executable `gh` into `dir` that answers
// `issue view` and `issue list` from `data` and logs each call. No test reaches a real service.
//   data: { issues: [{ number, title, state, stateReason, repo? }], fail?: boolean, repo?: 'owner/repo' }
// `fail` makes every call exit 1 as if gh were offline. An issue is found by number in `--repo`'s repository (default
// `data.repo`); one whose `repo` differs is only found there.
import { chmodSync, existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);

export function installGh(dir, data) {
  const dataFile = path.join(dir, 'gh-data.json');
  const logFile = path.join(dir, 'gh-calls.log');
  writeFileSync(dataFile, JSON.stringify(data));
  writeFileSync(logFile, '');
  const bin = path.join(dir, 'gh');
  writeFileSync(bin, `#!/bin/sh\nGG_GH_DATA="${dataFile}" GG_GH_LOG="${logFile}" exec "${process.execPath}" "${SELF}" "$@"\n`);
  chmodSync(bin, 0o755);
  return {
    dir,
    setData: (next) => writeFileSync(dataFile, JSON.stringify(next)),
    calls: () => readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
    // What the write verbs sent on standard input: [{ args, stdin }].
    inputs: () => (existsSync(`${logFile}.in`) ? readFileSync(`${logFile}.in`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []),
    data: () => JSON.parse(readFileSync(dataFile, 'utf8')),
  };
}

if (process.argv[1] === SELF) {
  const args = process.argv.slice(2);
  const data = JSON.parse(readFileSync(process.env.GG_GH_DATA, 'utf8'));
  appendFileSync(process.env.GG_GH_LOG, `${JSON.stringify(args)}\n`);
  if (data.fail) {
    console.error('gh: error connecting to api.github.com');
    process.exit(1);
  }
  const flag = (name) => args[args.indexOf(name) + 1];
  // Pull requests: data.prs [{ number, state, isDraft, baseRefName, title, body, checks: [{ name, bucket }] }], data.currentPr (the
  // number a bare `pr view` means) and data.defaultBranch for `repo view`.
  const pr = () => (data.prs ?? []).find((p) => String(p.number) === (args[2] && !args[2].startsWith('--') ? args[2] : String(data.currentPr)));
  const repo = flag('--repo') ?? data.repo;
  const inRepo = (data.issues ?? []).filter((i) => (i.repo ?? data.repo) === repo).map(({ repo: _r, ...issue }) => issue);
  if (args[0] === 'issue' && args[1] === 'view') {
    const issue = inRepo.find((i) => String(i.number) === args[2]);
    if (!issue) {
      console.error(`GraphQL: Could not resolve to an Issue with the number of ${args[2]}.`);
      process.exit(1);
    }
    console.log(JSON.stringify(issue));
  } else if (args[0] === 'issue' && args[1] === 'list') {
    console.log(JSON.stringify(inRepo));
  } else if (args[0] === 'issue' && ['create', 'comment'].includes(args[1])) {
    const stdin = readFileSync(0, 'utf8');
    appendFileSync(`${process.env.GG_GH_LOG}.in`, `${JSON.stringify({ args, stdin })}\n`);
    if (args[1] === 'create') {
      const number = Math.max(0, ...(data.issues ?? []).map((i) => i.number)) + 1;
      data.issues = [...(data.issues ?? []), { number, title: flag('--title'), state: 'OPEN', repo }];
      writeFileSync(process.env.GG_GH_DATA, JSON.stringify(data));
      console.log(`https://github.com/${repo}/issues/${number}`);
    } else console.log(`https://github.com/${repo}/issues/${args[2]}#issuecomment-1`);
  } else if (args[0] === 'issue' && args[1] === 'close') {
    const issue = (data.issues ?? []).find((i) => String(i.number) === args[2] && (i.repo ?? data.repo) === repo);
    if (!issue) process.exit(1);
    issue.state = 'CLOSED';
    issue.stateReason = flag('--reason') === 'not planned' ? 'NOT_PLANNED' : 'COMPLETED';
    writeFileSync(process.env.GG_GH_DATA, JSON.stringify(data));
    console.log(`Closed issue ${repo}#${args[2]}`);
  } else if (args[0] === 'pr' && args[1] === 'view') {
    const p = pr();
    if (!p) process.exit(1);
    const { checks: _c, ...rest } = p;
    console.log(JSON.stringify(rest));
  } else if (args[0] === 'pr' && args[1] === 'checks') {
    const p = pr();
    if (!p) process.exit(1);
    console.log(JSON.stringify(p.checks ?? []));
  } else if (args[0] === 'repo' && args[1] === 'view') {
    console.log(JSON.stringify({ defaultBranchRef: { name: data.defaultBranch ?? 'main' } }));
  } else {
    console.error(`gh stub: unsupported ${args.join(' ')}`);
    process.exit(2);
  }
}
