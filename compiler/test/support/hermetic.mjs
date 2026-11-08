// Preloaded into every test process (`node --import`): a test must not touch the developer's machine. It points `HOME` and
// `GO_GETTER_HOME` at a throwaway directory (children inherit both) and makes these calls throw, so the test that made one fails
// and names the call: a write under the real home or the real checkout's `.git`; `gh` that is not a stub; `git` run outside a
// temp directory or with `GIT_DIR` set; a bare `node` child (use `process.execPath`); a temp directory whose name does not start
// with `gg-` (the cleanup in tmp-cleanup.mjs removes only those).
import childProcess from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach } from 'node:test';

const realHome = os.homedir();
const realRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tmp = fs.realpathSync(os.tmpdir());
const home = fs.mkdtempSync(path.join(tmp, 'gg-home-'));
process.env.HOME = home;
process.env.GO_GETTER_HOME = path.join(home, 'go-getter');
delete process.env.XDG_STATE_HOME;

// A `gh` that records the call and fails, first on PATH for this process and every child, so a child that runs the real `gh`
// (go-getter digest, metrics) is seen too. A test that wants `gh` puts its own stub ahead of this one.
const bin = path.join(home, 'bin');
const ghLog = path.join(home, 'gh-calls.log');
fs.mkdirSync(bin);
fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\necho "$*" >> '${ghLog}'\nexit 1\n`, { mode: 0o755 });
process.env.PATH = `${bin}${path.delimiter}${process.env.PATH ?? ''}`;

const inside = (child, parent) => {
  const rel = path.relative(parent, path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
const underTmp = (p) => inside(p, tmp) || inside(p, os.tmpdir());
// A violation is recorded, not thrown: product code often catches errors (a hook fails closed, a digest tolerates a missing `gh`),
// which would hide the call from the test. `afterEach` fails the test that made the call.
const violations = [];
const fail = (what) => {
  const frame = new Error().stack.split('\n').slice(2).find((l) => !l.includes('support/hermetic.mjs') && !l.includes('node:internal'));
  violations.push(`${what} (${(frame ?? '').trim().replace(/^at /, '').replace(realRepo + '/', '')})`);
};

const protectedPath = (p) => {
  if (typeof p !== 'string' && !(p instanceof URL)) return false;
  const target = p instanceof URL ? fileURLToPath(p) : p;
  if (underTmp(target)) return false;
  return inside(target, path.join(realRepo, '.git')) || inside(target, path.join(realRepo, '.go-getter')) || inside(target, path.join(realHome, '.local')) || inside(target, path.join(realHome, '.claude')) || inside(target, path.join(realHome, '.go-getter'));
};
for (const name of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'renameSync', 'copyFileSync', 'writeFile', 'appendFile', 'mkdir', 'rm', 'rename']) {
  const original = fs[name];
  fs[name] = function (...args) {
    // copying reads its source; every other call here changes its first argument (rename also its second)
    const targets = name.startsWith('copyFile') ? [args[1]] : name.startsWith('rename') ? args.slice(0, 2) : [args[0]];
    for (const target of targets) if (protectedPath(target)) fail(`${name} writes ${target}, outside a temp directory`);
    return original.apply(this, args);
  };
}

for (const name of ['mkdtempSync', 'mkdtemp']) {
  const original = fs[name];
  fs[name] = function (prefix, ...rest) {
    if (typeof prefix === 'string' && path.dirname(prefix) === path.resolve(tmp) && !path.basename(prefix).startsWith('gg-')) fail(`${name}(${prefix}) is not a gg- prefix, so tmp-cleanup.mjs would leave it behind`);
    return original.call(this, prefix, ...rest);
  };
}

const resolveOnPath = (command, env) => {
  for (const dir of String(env.PATH ?? '').split(path.delimiter)) {
    const candidate = path.join(dir, command);
    if (dir && fs.existsSync(candidate)) return candidate;
  }
  return null;
};
// `file` is the program, `args` its arguments (exec/execSync give the whole line as `file`).
function check(file, options, shell, args = []) {
  const env = options?.env ?? process.env;
  const words = shell ? String(file).trim().split(/\s+/) : [file];
  const program = path.basename(String(words[0]));
  const cwd = options?.cwd ? path.resolve(String(options.cwd)) : process.cwd();
  if (file === 'node' && !shell) fail(`child "node" must be process.execPath (${file})`);
  if (program === 'gh') {
    const found = resolveOnPath('gh', env);
    if (found && !underTmp(found)) fail(`gh would run the real gh (${found}); put a stub first on PATH`);
  }
  if (program === 'git') {
    if (env.GIT_DIR) fail('git runs with GIT_DIR set; use cleanGitEnv');
    const named = args.flatMap((a, i) => (a === '--git-dir' || a === '-C' ? [args[i + 1]] : []));
    const makesNew = ['init', 'clone'].includes(args[0]) && underTmp(String(args.at(-1)));
    if (!underTmp(cwd) && !(named.length > 0 && named.every((d) => underTmp(String(d)))) && !makesNew) fail(`git runs in ${cwd}, outside a temp directory`);
  }
}
// util.promisify(execFile) resolves { stdout, stderr } through a symbol property the wrapper must carry over.
const keepPromisify = (wrapper, original) => {
  for (const key of Object.getOwnPropertySymbols(original)) wrapper[key] = original[key];
};
for (const name of ['spawn', 'spawnSync', 'execFile', 'execFileSync']) {
  const original = childProcess[name];
  childProcess[name] = function (file, ...rest) {
    const options = rest.find((r) => r && typeof r === 'object' && !Array.isArray(r));
    check(file, options, false, rest.find(Array.isArray));
    return original.call(this, file, ...rest);
  };
  keepPromisify(childProcess[name], original);
}
for (const name of ['exec', 'execSync']) {
  const original = childProcess[name];
  childProcess[name] = function (line, ...rest) {
    check(line, rest.find((r) => r && typeof r === 'object'), true);
    return original.call(this, line, ...rest);
  };
  keepPromisify(childProcess[name], original);
}
syncBuiltinESMExports();

afterEach(() => {
  if (fs.existsSync(ghLog)) {
    const calls = fs.readFileSync(ghLog, 'utf8').trim();
    fs.rmSync(ghLog);
    violations.push(`real gh ran: gh ${calls.split('\n')[0]}`);
  }
  if (violations.length === 0) return;
  const found = [...new Set(violations)];
  violations.length = 0;
  throw new Error(`hermetic guard: ${found.join('; ')}`);
});

process.on('exit', () => {
  try { fs.rmSync(home, { recursive: true, force: true }); } catch { /* best effort */ }
});
