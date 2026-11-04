// A scratch release project shared by the release tests: see scratch() below.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const cli = path.join(here, '../../bin/go-getter.mjs');
const fakeGh = path.join(here, 'fake-gh.mjs');
export const ident = { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
export const sh = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, ...ident } }).trim();

// A scratch project at tag v0.4.1 with a bare origin, a fake gh first on PATH and package scripts standing in for the three layers:
// a layer fails while a file named FAIL_<layer> exists; `build` copies package.json's version into manifest.json.
export function scratch() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-release-'));
  const remote = path.join(dir, 'remote.git');
  const work = path.join(dir, 'work');
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  symlinkSync(fakeGh, path.join(bin, 'gh'));
  chmodSync(fakeGh, 0o755);
  sh(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  sh(dir, 'clone', '-q', remote, work);
  const scripts = { build: 'node tools.mjs build', test: 'node tools.mjs test', 'check:generated': 'node tools.mjs generated', 'check:versions': 'node tools.mjs versions', eval: 'node tools.mjs eval' };
  writeFileSync(path.join(work, 'package.json'), `${JSON.stringify({ name: 'demo', version: '0.4.1', scripts }, null, 2)}\n`);
  writeFileSync(path.join(work, 'manifest.json'), `${JSON.stringify({ version: '0.4.1' })}\n`);
  writeFileSync(path.join(work, 'CHANGELOG.md'), '# Changelog\n\n## [0.4.1] - 2026-10-31\n\n### Fixed\n\n- an old fix\n');
  writeFileSync(path.join(work, 'tools.mjs'), `
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [, , what] = process.argv;
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
if (what === 'build') { writeFileSync('manifest.json', JSON.stringify({ version }) + '\\n'); process.exit(0); }
if (what === 'versions' && JSON.parse(readFileSync('manifest.json', 'utf8')).version !== version) { console.error('manifest disagrees'); process.exit(1); }
if (existsSync('FAIL_' + what)) { console.error(what + ' failed'); process.exit(1); }
`);
  sh(work, 'config', 'user.name', 't');
  sh(work, 'config', 'user.email', 't@t');
  sh(work, 'add', '-A');
  sh(work, 'commit', '-qm', 'chore: init');
  sh(work, 'branch', '-M', 'main');
  sh(work, 'tag', 'v0.4.1');
  sh(work, 'push', '-q', '-u', 'origin', 'main', '--tags');
  sh(work, 'remote', 'set-head', 'origin', '-a');
  const state = path.join(dir, 'gh-state.json');
  const home = path.join(dir, 'home');
  const run = (args, extra = {}) => {
    const r = spawnSync(process.execPath, [cli, ...args], { cwd: work, encoding: 'utf8', env: { ...process.env, ...ident, PATH: `${bin}:${process.env.PATH}`, GH_FAKE_STATE: state, GO_GETTER_HOME: home, GO_GETTER_SHIP_NO_CI_GRACE_MS: '0', ...extra } });
    return { code: r.status, out: r.stdout, err: r.stderr };
  };
  // A change merged to main: committed on a second clone and pushed, as a squash merge would land it.
  const other = path.join(dir, 'other');
  sh(dir, 'clone', '-q', remote, other);
  sh(other, 'config', 'user.name', 't');
  sh(other, 'config', 'user.email', 't@t');
  let n = 0;
  const merge = (subject, body = '', file = `change-${++n}.txt`) => {
    writeFileSync(path.join(other, file), `${subject}\n`);
    sh(other, 'add', '-A');
    sh(other, 'commit', '-qm', body ? `${subject}\n\n${body}` : subject);
    sh(other, 'push', '-q', 'origin', 'HEAD:main');
  };
  const gh = () => JSON.parse(readFileSync(state, 'utf8'));
  const setGh = (patch) => writeFileSync(state, JSON.stringify({ ...(existsSync(state) ? gh() : {}), ...patch }));
  const batch = (...a) => run(['release', '--batch', ...a]);
  const approve = (v) => run(['approvals', 'release', v]);
  return { dir, work, remote, home, merge, batch, approve, run, gh, setGh, sh: (...a) => sh(work, ...a) };
}

