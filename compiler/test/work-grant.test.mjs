import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { cleanGitEnv } from '../src/git-env.mjs';
import { ledgerView, readEntries } from '../src/work/ops.mjs';
import { issueGrant, recordSpend } from '../src/work/grant-ops.mjs';
import { applyGrants, parseGrant, parseWorkers, subsetProblems, ALWAYS_HUMAN } from '../src/work/grant.mjs';
import { makeEntry, briefVersion } from '../src/work/claim.mjs';
import { commitEntries, fetchLedger, pushRef, ledgerRef } from '../src/work/ledger.mjs';
import { tokenCovers } from '../src/work/scope.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(repoRoot, 'compiler/bin/go-getter.mjs');
const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: cleanGitEnv(process.env) }).trim();
const tmp = () => realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-grant-')));
const T0 = new Date('2026-11-04T09:00:00.000Z');

const PLAN = `# Feature
Owner-id: dana

## Phase
Id: P
Scope: src/**

### S1 One — [ ]
Class: implement · Needs: none · Scope: src/a/** · Check: \`true\`
Do: change the a module.

### S2 Two — [ ]
Class: implement · Needs: none · Scope: src/b/** · Check: \`true\`
Do: change the b module.

### S3 Three — [ ]
Class: implement · Needs: none · Scope: src/c/** · Check: \`true\`
Do: change the c module.
`;

const WORKERS = `# Workers

| id | tracker | kind | tags |
| --- | --- | --- | --- |
| dana | dana-gh | human | owner, review |
| bot | - | agent | code |
| bot2 | - | agent | code |
| ci1 | - | ci | build |
`;

const dana = { kind: 'human', id: 'dana' };
const bot = { kind: 'agent', id: 'bot' };
const bot2 = { kind: 'agent', id: 'bot2' };

// A bare remote seeded with the plan and the workers file, and clones of it (`remote: false` drops origin: the ledger is then a local ref).
function world({ remote = true } = {}) {
  const base = tmp();
  const bare = path.join(base, 'remote.git');
  sh(base, 'init', '--bare', '-b', 'main', bare);
  const seed = path.join(base, 'seed');
  sh(base, 'init', '-b', 'main', seed);
  sh(seed, 'config', 'user.name', 'seed');
  sh(seed, 'config', 'user.email', 'seed@example.test');
  mkdirSync(path.join(seed, 'docs/plans'), { recursive: true });
  writeFileSync(path.join(seed, 'docs/plans/feat.md'), PLAN);
  writeFileSync(path.join(seed, 'docs/workers.md'), WORKERS);
  sh(seed, 'add', '-A');
  sh(seed, 'commit', '-m', 'seed');
  sh(seed, 'remote', 'add', 'origin', bare);
  sh(seed, 'push', 'origin', 'main');
  const clone = (name) => {
    const dir = path.join(base, name);
    sh(base, 'clone', bare, dir);
    if (!remote) sh(dir, 'remote', 'remove', 'origin');
    sh(dir, 'config', 'user.name', name);
    sh(dir, 'config', 'user.email', `${name}@example.test`);
    return dir;
  };
  return { base, bare, clone };
}

const ROOT = {
  scope: ['src/**'],
  spend: 100,
  shapes: ['git-push', 'pr-create'],
  asks: 'default-reversible',
  data: ['internal', 'public'],
  effects: { reversible: true, money: { amount: 50, period: 'day' }, physical: ['zoneA', 'zoneB'], legal: ['nda@acme'] },
};
const NARROW = {
  scope: ['src/a/**'],
  spend: 60,
  shapes: ['git-push'],
  asks: 'all',
  data: ['public'],
  effects: { reversible: true, money: { amount: 20, period: 'day' }, physical: ['zoneA'], legal: ['nda@acme'] },
};
// One wider variant per dimension (and per effect class).
const WIDER = {
  scope: { ...NARROW, scope: ['docs/**'] },
  spend: { ...NARROW, spend: 101 },
  shapes: { ...NARROW, shapes: ['pr-merge'] },
  asks: { ...NARROW, asks: 'unrecoverable-only' },
  data: { ...NARROW, data: ['restricted'] },
  'effects (money)': { ...NARROW, effects: { ...NARROW.effects, money: { amount: 60, period: 'day' } } },
  'effects (money period)': { ...NARROW, effects: { ...NARROW.effects, money: { amount: 20, period: 'week' } } },
  'effects (physical)': { ...NARROW, effects: { ...NARROW.effects, physical: ['zoneC'] } },
  'effects (legal)': { ...NARROW, effects: { ...NARROW.effects, legal: ['msa@acme'] } },
};

const opts = { now: T0 };
const view = (dir, stem = 'feat') => ledgerView(dir, stem, { now: T0, remote: 'origin' });
const unitOf = (dir, unit) => view(dir).entries.find((e) => e.unit === unit);

// Writes an entry straight into the ledger, bypassing the verbs (what a hostile or buggy writer could push).
function forge(dir, unit, { holder, issuer, grant, author = issuer.id, parent = 'feat#P', remote = 'origin' }) {
  const brief = { Scope: ['src/a/**'], Accept: null, Do: 'x', 'Done-when': null, Budget: null };
  const entry = makeEntry({ unit, holder, issuer, scope: ['src/a/**'], now: T0, leaseMs: 60 * 60_000, brief, parent, grant });
  const ledger = fetchLedger(dir, 'feat', remote);
  const commit = commitEntries(dir, ledger.tip, { [`${unit.split('#')[1]}.json`]: entry }, { author, message: `forged ${unit}`, now: T0 });
  assert.ok(pushRef(dir, remote, ledgerRef('feat'), commit, ledger.tip).ok);
  return entry;
}
const readFresh = (dir) => {
  const ledger = fetchLedger(dir, 'feat', 'origin');
  return readEntries(dir, ledger.tip, { nowMs: T0.getTime() });
};

test('the grant language: a subset on every dimension is accepted, a wider one is named on each', () => {
  assert.deepEqual(subsetProblems(NARROW, ROOT), []);
  assert.deepEqual(subsetProblems(ROOT, ROOT), []);
  for (const [dim, wider] of Object.entries(WIDER)) {
    const problems = subsetProblems(wider, ROOT);
    assert.equal(problems.length, 1, `${dim}: ${JSON.stringify(problems)}`);
    assert.ok(problems[0].startsWith(dim.split(' ')[0]), problems[0]);
  }
  assert.ok(tokenCovers('src/**', 'src/a/**') && !tokenCovers('src/a.mjs', 'src/b.mjs'));
  assert.ok(tokenCovers('src', 'src/a/b.mjs') && !tokenCovers('src/a/**', 'src/**') && !tokenCovers('interface:api', 'src/a'));
  const parsed = parseGrant({ scope: 'src/a/**', spend: '5', shapes: 'git-push', asks: 'all', data: 'public', effects: 'reversible,money:20/day,physical:zoneA+zoneB,legal:nda@acme' });
  assert.deepEqual(parsed.grant.effects, { reversible: true, money: { amount: 20, period: 'day' }, physical: ['zoneA', 'zoneB'], legal: ['nda@acme'] });
  assert.match(parseGrant({ scope: 'a', spend: '1', shapes: 'git-push', asks: 'all', data: 'x', effects: 'telepathy' }).error, /never granted/);
  assert.match(parseGrant({ scope: 'a', spend: '1', shapes: 'git-push', asks: 'all', data: 'x', effects: 'money' }).error, /cap/);
  assert.deepEqual(parseWorkers(WORKERS).map((w) => [w.id, w.kind]), [['dana', 'human'], ['bot', 'agent'], ['bot2', 'agent'], ['ci1', 'ci']]);
});

test('a subset grant is accepted and recorded with its issuer; every reader sees it', async () => {
  const w = world();
  const a = w.clone('a');
  const root = await issueGrant(a, 'feat#P', dana, { ...opts, grant: ROOT });
  assert.ok(root.ok, root.error);
  const child = await issueGrant(a, 'feat#S1', dana, { ...opts, grant: NARROW, to: bot });
  assert.ok(child.ok, child.error);
  const b = w.clone('b'); // a second clone of the same remote
  const e = unitOf(b, 'feat#S1');
  assert.deepEqual(e.grant, NARROW);
  assert.deepEqual(e.issuer, dana);
  assert.deepEqual(e.holder, bot);
  assert.equal(e.parent, 'feat#P');
  assert.deepEqual(view(b).ignored.filter((i) => /grant/.test(i.reason)), []);
});

test('a wider grant is refused on each dimension by the verb, and ignored by a second reader when forged into the ledger', async () => {
  const w = world();
  const a = w.clone('a');
  assert.ok((await issueGrant(a, 'feat#P', dana, { ...opts, grant: ROOT })).ok);
  for (const [dim, wider] of Object.entries(WIDER)) {
    const r = await issueGrant(a, 'feat#S1', dana, { ...opts, grant: wider, to: bot });
    assert.equal(r.ok, false, dim);
    assert.equal(r.code, 'wider', dim);
    assert.match(r.error, new RegExp(dim.split(' ')[0]), dim);
  }
  assert.equal(unitOf(a, 'feat#S1'), undefined, 'a refused grant wrote nothing');
  // forged: the issuer is the holder of the parent, the commit is theirs, only the width is wrong
  const b = w.clone('b');
  const forged = forge(b, 'feat#S1', { holder: bot, issuer: dana, grant: WIDER.spend });
  assert.equal(forged.grant.spend, 101);
  const c = w.clone('c');
  const { entries, ignored } = readFresh(c);
  assert.equal(entries.find((e) => e.unit === 'feat#S1'), undefined);
  assert.ok(ignored.some((i) => i.file === 'S1.json' && /grant: wider than its parent feat#P: spend/.test(i.reason)), JSON.stringify(ignored));
  assert.ok(entries.find((e) => e.unit === 'feat#P'), 'the root grant stays');
  for (const [dim, wider] of Object.entries(WIDER)) {
    const { ignored: ig } = applyGrants(
      [{ ...forged, grant: wider }, ...readFresh(c).entries.filter((e) => e.unit === 'feat#P')],
      { authors: new Map([['feat#S1', 'dana'], ['feat#P', 'dana']]), humans: new Set(['dana']) },
    );
    assert.equal(ig.length, 1, dim);
  }
});

test('an always-human shape, an unknown shape and an uncapped effect are refused', async () => {
  const w = world();
  const a = w.clone('a');
  for (const shape of ALWAYS_HUMAN) {
    const r = await issueGrant(a, 'feat#P', dana, { ...opts, grant: { ...ROOT, shapes: [shape] } });
    assert.equal(r.code, 'never-delegable', shape);
    assert.match(r.error, /always done by a human/);
  }
  assert.match((await issueGrant(a, 'feat#P', dana, { ...opts, grant: { ...ROOT, shapes: ['rm-rf'] } })).error, /can be granted/);
  assert.equal((await issueGrant(a, 'feat#P', dana, { ...opts, grant: { ...ROOT, effects: { teleport: true } } })).code, 'never-delegable');
  assert.equal((await issueGrant(a, 'feat#P', dana, { ...opts, grant: { ...ROOT, effects: { money: {} } } })).code, 'never-delegable');
  assert.equal(view(a).entries.length, 0);
  // forged into the ledger, a reader ignores it too
  forge(a, 'feat#P', { holder: dana, issuer: dana, grant: { ...ROOT, shapes: ['force-push'] }, parent: null });
  assert.ok(readFresh(w.clone('b')).ignored.some((i) => /always done by a human/.test(i.reason)));
});

test('spend rolls up to an ancestor cap across two clones and parks the unit as a spend ask', async () => {
  const w = world();
  const a = w.clone('a');
  const b = w.clone('b');
  assert.ok((await issueGrant(a, 'feat#P', dana, { ...opts, grant: { ...ROOT, spend: 100 } })).ok);
  assert.ok((await issueGrant(a, 'feat#S1', dana, { ...opts, grant: { ...NARROW, spend: 70 }, to: bot })).ok);
  assert.ok((await issueGrant(b, 'feat#S2', dana, { ...opts, grant: { ...NARROW, scope: ['src/b/**'], spend: 70 }, to: bot2 })).ok);
  const first = await recordSpend(a, 'feat#S1', bot, 60, opts);
  assert.ok(first.ok, first.error);
  assert.equal(first.spent, 60);
  // the other clone's unit is under its own cap (50 of 70) but the parent's 100 would be passed by 60 + 50
  const over = await recordSpend(b, 'feat#S2', bot2, 50, opts);
  assert.equal(over.ok, false);
  assert.equal(over.code, 'spend-cap');
  assert.equal(over.over.unit, 'feat#P');
  assert.match(over.error, /parked as an ask of class spend/);
  const e = unitOf(a, 'feat#S2');
  assert.equal(e.state, 'parked');
  assert.equal(e.ask.kind, 'spend');
  assert.deepEqual(e.scope, []);
  assert.equal(e.spent ?? 0, 0, 'the refused amount was not recorded');
  // the unit's own cap holds too, and what fits is still recorded
  assert.equal((await recordSpend(a, 'feat#S1', bot, 11, opts)).code, 'spend-cap');
  assert.equal(unitOf(b, 'feat#S1').state, 'parked');
});

test('spend within every cap is recorded and read from the ledger by another clone', async () => {
  const w = world();
  const a = w.clone('a');
  const b = w.clone('b');
  assert.ok((await issueGrant(a, 'feat#P', dana, { ...opts, grant: ROOT })).ok);
  assert.ok((await issueGrant(a, 'feat#S1', dana, { ...opts, grant: NARROW, to: bot })).ok);
  assert.ok((await issueGrant(a, 'feat#S2', dana, { ...opts, grant: { ...NARROW, scope: ['src/b/**'] }, to: bot2 })).ok);
  assert.ok((await recordSpend(a, 'feat#S1', bot, 60, opts)).ok);
  assert.ok((await recordSpend(b, 'feat#S2', bot2, 40, opts)).ok); // 60 + 40 = the parent's 100
  assert.equal((await recordSpend(b, 'feat#S2', bot2, 1, opts)).code, 'spend-cap');
  assert.equal((await recordSpend(b, 'feat#S1', bot2, 1, opts)).code, 'not-holder');
  assert.equal(unitOf(a, 'feat#S1').spent, 60);
});

test('a root grant needs a listed human: an agent, an unlisted human and a listed agent are refused, and a forged root is ignored', async () => {
  const w = world();
  const a = w.clone('a');
  for (const issuer of [bot, { kind: 'human', id: 'mallory' }, { kind: 'agent', id: 'dana' }, { kind: 'human', id: 'bot' }]) {
    const r = await issueGrant(a, 'feat#P', issuer, { ...opts, grant: ROOT });
    assert.equal(r.code, 'not-human', JSON.stringify(issuer));
    assert.match(r.error, /listed in docs\/workers\.md/);
  }
  assert.equal(view(a).entries.length, 0);
  // an agent that forges a root entry: naming itself human, naming a listed human it did not author as, or taking over a claimed unit's grant
  forge(a, 'feat#P', { holder: bot, issuer: { kind: 'human', id: 'bot' }, grant: ROOT, parent: null }); // human by its own say-so, not listed as one
  let r = readFresh(w.clone('b'));
  assert.equal(r.entries.length, 0);
  assert.match(r.ignored.map((i) => i.reason).join('\n'), /root grant must come from a worker of kind human/);
  forge(a, 'feat#S3', { holder: bot, issuer: dana, grant: ROOT, parent: null, author: 'bot' }); // names dana as issuer, authored by bot
  r = readFresh(w.clone('c'));
  assert.equal(r.entries.some((e) => e.unit === 'feat#S3'), false);
  assert.match(r.ignored.map((i) => i.reason).join('\n'), /written by bot, not by its issuer dana/);
  // and the same grant authored by the listed human passes: the check is on the identity, advisory against stolen credentials (decision 0171 item 6)
  forge(a, 'feat#S2', { holder: dana, issuer: dana, grant: ROOT, parent: null });
  assert.ok(readFresh(w.clone('d')).entries.some((e) => e.unit === 'feat#S2'));
});

test('an agent cannot widen by sub-delegating, nor delegate from a unit it neither holds nor issued', async () => {
  const w = world();
  const a = w.clone('a');
  assert.ok((await issueGrant(a, 'feat#P', dana, { ...opts, grant: ROOT, to: bot })).ok); // the agent holds the parent
  const wider = await issueGrant(a, 'feat#S1', bot, { ...opts, grant: WIDER.shapes, to: bot2 });
  assert.equal(wider.code, 'wider');
  const ok = await issueGrant(a, 'feat#S1', bot, { ...opts, grant: NARROW, to: bot2 });
  assert.ok(ok.ok, ok.error);
  assert.deepEqual(unitOf(a, 'feat#S1').issuer, bot);
  const stranger = await issueGrant(a, 'feat#S2', bot2, { ...opts, grant: { ...NARROW, scope: ['src/b/**'] }, to: bot2 });
  assert.equal(stranger.code, 'not-issuer');
});

test('go-getter work grant and grant-check: the verb issues, refuses and reports a forged entry', () => {
  const w = world({ remote: false });
  const a = w.clone('a');
  const run = (who, kind, ...args) => {
    try {
      return { code: 0, out: execFileSync(process.execPath, [cli, 'work', ...args], { cwd: a, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...cleanGitEnv(process.env), CI: '', GO_GETTER_WORKER: who, GO_GETTER_WORKER_KIND: kind } }) };
    } catch (e) {
      return { code: e.status, out: `${e.stdout}${e.stderr}` };
    }
  };
  const flags = (g, extra = []) => ['--scope', g.scope.join(','), '--spend', String(g.spend), '--shapes', g.shapes.join(','), '--asks', g.asks, '--data', g.data.join(','), ...extra];
  const rootArgs = flags({ ...ROOT, scope: ['src/**'] }, ['--effects', 'reversible,money:50/day']);
  let r = run('bot', 'agent', 'grant', 'feat#P', ...rootArgs);
  assert.equal(r.code, 1);
  assert.match(r.out, /root grant, written only by a worker of kind human/);
  r = run('dana', 'human', 'grant', 'feat#P', ...rootArgs);
  assert.equal(r.code, 0, r.out);
  r = run('dana', 'human', 'grant', 'feat#S1', ...flags({ ...NARROW, shapes: ['git-push', 'force-push'] }, ['--to', 'bot', '--to-kind', 'agent']));
  assert.equal(r.code, 1);
  assert.match(r.out, /always done by a human/);
  r = run('dana', 'human', 'grant', 'feat#S1', ...flags({ ...NARROW, spend: 500 }, ['--to', 'bot', '--to-kind', 'agent']));
  assert.equal(r.code, 1);
  assert.match(r.out, /wider than feat#P's on spend/);
  r = run('dana', 'human', 'grant', 'feat#S1', ...flags(NARROW, ['--to', 'bot', '--to-kind', 'agent', '--effects', 'reversible,money:20/day']));
  assert.equal(r.code, 0, r.out);
  assert.equal(run('bot', 'agent', 'spend', 'feat#S1', '30').code, 0);
  r = run('bot', 'agent', 'spend', 'feat#S1', '31');
  assert.equal(r.code, 3);
  assert.match(r.out, /parked as an ask of class spend/);
  assert.equal(run('dana', 'human', 'grant-check').code, 0);
  // a wider entry pushed straight into the ledger is named by grant-check
  forge(a, 'feat#S2', { holder: bot, issuer: dana, grant: { ...WIDER.scope, scope: ['docs/**'] }, remote: null });
  r = run('dana', 'human', 'grant-check');
  assert.equal(r.code, 1);
  assert.match(r.out, /S2\.json: grant: wider than its parent feat#P: scope/);
  assert.equal(briefVersion({ a: 1 }).length, 16);
});
