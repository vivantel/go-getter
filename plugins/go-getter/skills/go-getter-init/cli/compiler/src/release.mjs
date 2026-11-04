// `go-getter release --batch` (decisions 0094, 0157): releases everything merged since the last tag as one pull request.
// It reads the merged commits, derives the version bump from their Conventional Commit types, writes the changelog entry and
// the version files, runs the three verification layers (unit, golden/drift, behavior eval; guardrail release-requires-passing-gate),
// opens one release pull request and squash-merges it, but only after a person recorded the approval for that exact version
// (`go-getter approvals release <version>`). It never tags or publishes: tags and releases stay with a human (decision 0094).
// No model is involved. Each step is a small function over the injectable runner, as in ship.mjs.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { defaultBranch } from './git-env.mjs';
import { suggestRefs } from './refs.mjs';
import { createCheckpoint } from './checkpoint.mjs';
import { shapeApproved, listShapes } from './secrets/approvals.mjs';
import { ShipError, defaultRunner, buildMessage, waitForCi } from './ship.mjs';

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)$/;
const CONVENTIONAL = /^([a-z]+)(?:\(([^)]+)\))?(!)?: (\S.*)$/;
const SEP = '\u001f';
const END = '\u001e';

// The approval id for a version spelled `1.2.3` or `v1.2.3`; null when it is not a plain release version.
// The approval is bound to the exact default-branch head it was given for: `release:vX.Y.Z@<sha>`.
export const releaseApprovalId = (version, sha) => (SEMVER.test(String(version)) && /^[0-9a-f]{40}$/.test(String(sha)) ? `release:v${String(version).replace(/^v/, '')}@${sha}` : null);

// The origin default branch's head sha after a fetch, for `approvals release` (a given sha or prefix must resolve to it or to an ancestor-free exact match).
export function releaseHead(project, run = defaultRunner) {
  const git = (...a) => run('git', a, { cwd: project });
  const base = defaultBranch(project);
  if (!base.known) throw new ShipError('release: cannot tell the default branch (no origin/HEAD); run `git remote set-head origin -a`');
  const f = git('fetch', '--tags', 'origin', base.name);
  if (f.code !== 0) throw new ShipError(`git fetch: ${(f.err || f.out).trim()}`);
  const r = git('rev-parse', `origin/${base.name}`);
  if (r.code !== 0) throw new ShipError(`git rev-parse: ${(r.err || r.out).trim()}`);
  return r.out.trim();
}

// One merged commit: { sha, type, scope, breaking, description, subject } or null when its subject is not a Conventional Commit.
export function parseCommit(sha, subject, body = '') {
  const m = CONVENTIONAL.exec(subject);
  if (!m) return null;
  const [, type, scope, bang, description] = m;
  return { sha, type, scope: scope ?? null, breaking: Boolean(bang) || /^BREAKING[ -]CHANGE:/m.test(body), description, subject };
}

// The release commits themselves are not changes to release.
const isReleaseCommit = (c) => c.type === 'chore' && c.scope === 'release';

// 'major' | 'minor' | 'patch' | null (nothing releasable). A breaking change before 1.0.0 raises the minor, as semver allows.
export function bumpOf(commits, from) {
  const changes = commits.filter((c) => !isReleaseCommit(c));
  if (changes.some((c) => c.breaking)) return Number(SEMVER.exec(from)?.[1]) >= 1 ? 'major' : 'minor';
  if (changes.some((c) => c.type === 'feat')) return 'minor';
  if (changes.some((c) => ['fix', 'perf', 'revert'].includes(c.type))) return 'patch';
  return null;
}

export function nextVersion(from, bump) {
  const [, a, b, c] = SEMVER.exec(from).map(Number);
  return bump === 'major' ? `${a + 1}.0.0` : bump === 'minor' ? `${a}.${b + 1}.0` : `${a}.${b}.${c + 1}`;
}

const SECTIONS = [
  ['Added', (c) => c.type === 'feat'],
  ['Fixed', (c) => c.type === 'fix'],
  ['Changed', (c) => ['perf', 'refactor', 'revert'].includes(c.type)],
];
const line = (c) => `- ${c.breaking ? '**Breaking:** ' : ''}${c.scope ? `${c.scope}: ` : ''}${c.description}`;

// The Keep a Changelog entry for the commits; documentation, tests, build and chores are left out of the entry.
export function changelogEntry(version, date, commits) {
  const changes = commits.filter((c) => !isReleaseCommit(c));
  const lines = [`## [${version}] - ${date}`];
  for (const [title, test] of SECTIONS) {
    const own = changes.filter(test);
    if (own.length) lines.push('', `### ${title}`, '', ...own.map(line));
  }
  return `${lines.join('\n')}\n`;
}

export function prependChangelog(text, entry) {
  const head = '# Changelog\n';
  if (!text.startsWith(head)) return `${head}\n${entry}${text ? `\n${text}` : ''}`;
  return `${head}\n${entry}\n${text.slice(head.length).replace(/^\n+/, '')}`;
}

// The version files: package.json and, when there is one, package-lock.json (its root entries); the generated manifests follow from `npm run build`.
function writeVersionFiles(project, version) {
  const pkgFile = path.join(project, 'package.json');
  const text = readFileSync(pkgFile, 'utf8');
  const next = text.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`);
  if (next === text) throw new ShipError('release: package.json has no version to bump');
  writeFileSync(pkgFile, next);
  const files = ['package.json'];
  const lockFile = path.join(project, 'package-lock.json');
  if (existsSync(lockFile)) {
    const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
    lock.version = version;
    if (lock.packages?.['']) lock.packages[''].version = version;
    writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
    files.push('package-lock.json');
  }
  return files;
}

// The three verification layers of decision 0013, as package scripts the project defines. A layer with no script cannot be verified, so it refuses.
export const LAYERS = [
  { name: 'unit tests', scripts: ['test'] },
  { name: 'golden and drift', scripts: ['check:generated', 'check:versions'], clean: true },
  { name: 'behavior evals', scripts: ['eval'] },
];

export async function releaseBatch(project, opts = {}, run = defaultRunner, log = () => {}) {
  const { dryRun = false, now = () => new Date(), env = process.env, intervalMs, timeoutMs, noCiGraceMs, allowNoCi = false } = opts;
  const git = (...a) => run('git', a, { cwd: project });
  const gh = (...a) => run('gh', a, { cwd: project });
  const npm = (...a) => run('npm', a, { cwd: project });
  const need = (r, what) => {
    if (r.code !== 0) throw new ShipError(`${what}: ${(r.err || r.out).trim().split('\n').slice(-3).join(' | ')}`);
    return r.out.trim();
  };

  // 1 Preflight: tools, a clean tree, the default branch fetched.
  const base = defaultBranch(project);
  if (!base.known) throw new ShipError('release: cannot tell the default branch (no origin/HEAD); run `git remote set-head origin -a`');
  if (git('remote', 'get-url', 'origin').code !== 0) throw new ShipError('release: no remote named origin');
  if (gh('--version').code !== 0) throw new ShipError('release: the gh CLI is required (https://cli.github.com), and `gh auth login` must have been run', 127);
  if (need(git('status', '--porcelain'), 'git status')) throw new ShipError('release: the working tree has uncommitted changes; commit or stash them first');
  need(git('fetch', '--tags', 'origin', base.name), 'git fetch');
  const pkg = JSON.parse(readFileSync(path.join(project, 'package.json'), 'utf8'));
  const scripts = pkg.scripts ?? {};
  const missing = LAYERS.flatMap((l) => l.scripts.filter((s) => !scripts[s]).map((s) => `${l.name}: npm run ${s}`));
  if (missing.length) throw new ShipError(`release: package.json lacks a script for a verification layer, so it cannot be verified: ${missing.join('; ')}`);

  // 2 What merged since the last tag, and the version it makes.
  const tag = git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', `origin/${base.name}`);
  const lastTag = tag.code === 0 ? tag.out.trim() : null;
  const from = lastTag ? lastTag.replace(/^v/, '') : pkg.version;
  if (!SEMVER.test(from)) throw new ShipError(`release: cannot read a version from ${lastTag ?? 'package.json'}`);
  if (pkg.version !== from) throw new ShipError(`release: package.json is at ${pkg.version} but the last tag is ${lastTag}; settle the version before a batch release`);
  const raw = need(git('log', '--format=%H' + SEP + '%s' + SEP + '%b' + END, ...(lastTag ? [`${lastTag}..origin/${base.name}`] : [`origin/${base.name}`])), 'git log');
  const commits = raw.split(END).map((r) => r.trim()).filter(Boolean).map((r) => {
    const [sha, subject, body] = r.split(SEP);
    return parseCommit(sha, subject, body);
  }).filter(Boolean).filter((c) => !isReleaseCommit(c));
  const bump = bumpOf(commits, from);
  if (!bump) throw new ShipError(`release: nothing to release; no feat, fix, perf, revert or breaking change merged since ${lastTag ?? 'the start'}`);
  const version = nextVersion(from, bump);
  const head = need(git('rev-parse', `origin/${base.name}`), 'git rev-parse');
  const approvalId = releaseApprovalId(version, head);
  log('plan', `${commits.length} change${commits.length === 1 ? '' : 's'} since ${lastTag ?? 'the start'}: ${bump} bump, ${from} -> ${version}`);
  if (dryRun) {
    log('dry-run', `would release v${version}; a person approves it first with: go-getter approvals release v${version} ${head} (default branch head ${head})`);
    return { dryRun: true, version, bump, commits, head, approved: shapeApproved(project, approvalId, env) };
  }

  // 3 The recorded human approval, before anything is written or sent (guardrail human-escalation-rule, decision 0094).
  if (!shapeApproved(project, approvalId, env)) {
    const prefix = `release:v${version}@`;
    const stale = listShapes(project, env).map((e) => e.id).filter((id) => id.startsWith(prefix));
    const reapprove = `go-getter approvals release v${version} ${head}`;
    if (stale.length) throw new ShipError(`release: v${version} was approved for ${stale.map((id) => id.slice(prefix.length)).join(', ')} but ${base.name} is now at ${head}; re-approve the new head with: ${reapprove}`, 2);
    throw new ShipError(`release: v${version} at ${base.name} ${head} is not approved; a person records the approval with: ${reapprove} (\`release --batch --dry-run\` lists what it would release)`, 2);
  }

  // 4 A checkpoint (guardrail checkpoint-before-gated-action), then the release branch from the default branch.
  const original = git('branch', '--show-current').out.trim();
  const branch = `chore/release-${version}`;
  const cp = createCheckpoint(project, { label: `release ${version}` });
  if (cp) log('checkpoint', cp.ref);
  need(git('switch', '-c', branch, `origin/${base.name}`), 'git switch');
  const restore = () => {
    if (original && git('switch', original).code === 0) git('branch', '-D', branch);
  };
  try {
    // 5 Changelog entry and version files, then the generated manifests.
    const date = now().toISOString().slice(0, 10);
    const entry = changelogEntry(version, date, commits);
    const changelog = path.join(project, 'CHANGELOG.md');
    writeFileSync(changelog, prependChangelog(existsSync(changelog) ? readFileSync(changelog, 'utf8') : '', entry));
    writeVersionFiles(project, version);
    if (scripts.build) need(npm('run', '--silent', 'build'), 'npm run build');
    log('files', `CHANGELOG.md, package.json, generated manifests at ${version}`);

    // 6 The three layers, on the release commit's tree, before anything leaves this machine.
    const layers = [];
    for (const layer of LAYERS) {
      for (const script of layer.scripts) {
        const r = npm('run', '--silent', script);
        if (r.code !== 0) throw new ShipError(`release: verification layer "${layer.name}" failed (npm run ${script}); nothing was pushed: ${(r.err || r.out).trim().split('\n').slice(-3).join(' | ')}`);
      }
      layers.push(`${layer.name}: ${layer.scripts.map((s) => `npm run ${s}`).join(', ')} passed`);
      log('verify', layers.at(-1));
    }
    git('add', '-A');
    const staged = suggestRefs(project, { staged: true }).must.map((r) => r.path);
    const title = `chore(release): v${version}`;
    const why = `Release v${version}: ${commits.length} merged change${commits.length === 1 ? '' : 's'} since ${lastTag ?? 'the start'}, a ${bump} bump from their Conventional Commit types.`;
    need(git('commit', '-m', buildMessage({ title, why, refs: staged })), 'git commit');

    // 7 One pull request for the whole batch.
    need(git('push', '-u', 'origin', 'HEAD'), 'git push');
    const body = [
      '## Intent', '', why, '',
      '## Changes', '', ...commits.map((c) => `- ${c.subject}`), '',
      '## Checks', '', ...layers.map((l) => `- ${l}`), `- approval: release:v${version} recorded by a person`, '',
      'Opened by `go-getter release --batch`. Merging it does not tag or publish; a person tags v' + version + ' to publish.',
    ].join('\n');
    need(gh('pr', 'create', '--base', base.name, '--head', branch, '--title', title, '--body', body), 'gh pr create');
    const pr = JSON.parse(need(gh('pr', 'view', branch, '--json', 'number,url,state'), 'gh pr view'));
    log('pr', pr.url);

    // 8 CI green, then the squash merge.
    const ci = await waitForCi({ gh, pr, verb: 'release', intervalMs, timeoutMs, noCiGraceMs, log });
    if (ci === 'none' && !allowNoCi) throw new ShipError(`release: no CI checks reported; merge by hand or pass --allow-no-ci: ${pr.url}`, 3);
    gh('pr', 'merge', String(pr.number), '--squash', '--delete-branch');
    const state = JSON.parse(need(gh('pr', 'view', String(pr.number), '--json', 'state'), 'gh pr view')).state;
    if (state !== 'MERGED') throw new ShipError(`release: the pull request is ${state}, not merged: ${pr.url}`);
    log('merge', `squashed ${pr.url}`);
    restore();
    git('fetch', 'origin', base.name);
    return { version, bump, commits, pr, merged: true, tag: `v${version}` };
  } catch (err) {
    // A failure before the push leaves nothing behind; after it the pull request stays open and the branch stays for inspection.
    if (!git('ls-remote', '--exit-code', '--heads', 'origin', branch).out) {
      git('reset', '-q', '--hard', 'HEAD');
      git('clean', '-fdq');
      restore();
    }
    throw err;
  }
}
