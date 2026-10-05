// Repository detection probes (plan 4.2): facts the init interview prefills instead of asking.
// Output is deterministic: sorted arrays, null when unknown.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', 'dist', 'build', '.venv', 'venv', 'target', '__pycache__']);

const has = (root, rel) => existsSync(path.join(root, rel));
const readJson = (root, rel) => {
  try {
    return JSON.parse(readFileSync(path.join(root, rel), 'utf8'));
  } catch {
    return null;
  }
};
const readText = (root, rel) => (has(root, rel) ? readFileSync(path.join(root, rel), 'utf8') : '');
const sorted = (set) => [...set].sort();

function walk(root, maxDepth, visit, rel = '', depth = 0) {
  let names;
  try {
    names = readdirSync(path.join(root, rel));
  } catch {
    return;
  }
  for (const name of names.sort()) {
    const r = rel ? `${rel}/${name}` : name;
    let isDir;
    try {
      isDir = statSync(path.join(root, r)).isDirectory();
    } catch {
      continue;
    }
    visit(r, name, isDir);
    if (isDir && depth < maxDepth && !SKIP_DIRS.has(name)) walk(root, maxDepth, visit, r, depth + 1);
  }
}

function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

// Commands inferred from conventions; null when unknown.
function detectCommands(root, { pkg, pyproject, packageManagers, languages }) {
  const commands = { test: null, lint: null, typecheck: null };
  if (pkg) {
    const manager = ['pnpm', 'yarn', 'bun'].find((m) => packageManagers.has(m)) ?? 'npm';
    const run = (name) => (name === 'test' ? `${manager} test` : manager === 'npm' ? `npm run ${name}` : `${manager} run ${name}`);
    const scripts = pkg.scripts ?? {};
    // A stock `npm init` placeholder is not a test command.
    if (scripts.test && !/no test specified/.test(scripts.test)) commands.test = run('test');
    if (scripts.lint) commands.lint = run('lint');
    for (const name of ['typecheck', 'type-check', 'tsc']) if (scripts[name] && !commands.typecheck) commands.typecheck = run(name);
  }
  const make = readText(root, 'Makefile');
  const target = (name) => new RegExp(`^${name}:`, 'm').test(make);
  for (const name of ['test', 'lint', 'typecheck']) if (!commands[name] && target(name)) commands[name] = `make ${name}`;
  if (languages.has('python')) {
    if (!commands.test && (/pytest/.test(pyproject) || has(root, 'pytest.ini'))) commands.test = 'pytest';
    if (!commands.lint && (/\[tool\.ruff/.test(pyproject) || has(root, 'ruff.toml'))) commands.lint = 'ruff check .';
    if (!commands.typecheck && (/\[tool\.mypy/.test(pyproject) || has(root, 'mypy.ini'))) commands.typecheck = 'mypy .';
  }
  if (languages.has('go')) {
    commands.test ??= 'go test ./...';
    commands.lint ??= has(root, '.golangci.yml') || has(root, '.golangci.yaml') ? 'golangci-lint run' : 'go vet ./...';
    commands.typecheck ??= 'go build ./...';
  }
  if (languages.has('rust')) {
    commands.test ??= 'cargo test';
    commands.lint ??= 'cargo clippy';
    commands.typecheck ??= 'cargo check';
  }
  return commands;
}

export function detect(root) {
  const pkg = readJson(root, 'package.json');
  const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
  const pyproject = readText(root, 'pyproject.toml');

  const languages = new Set();
  if (pkg) languages.add(has(root, 'tsconfig.json') || deps.typescript ? 'typescript' : 'javascript');
  if (pyproject || has(root, 'requirements.txt') || has(root, 'setup.py')) languages.add('python');
  if (has(root, 'go.mod')) languages.add('go');
  if (has(root, 'Cargo.toml')) languages.add('rust');
  if (has(root, 'pom.xml') || has(root, 'build.gradle') || has(root, 'build.gradle.kts')) languages.add('java');
  if (has(root, 'Gemfile')) languages.add('ruby');
  if (has(root, 'composer.json')) languages.add('php');

  const lockfiles = [
    ['package-lock.json', 'npm'], ['pnpm-lock.yaml', 'pnpm'], ['yarn.lock', 'yarn'], ['bun.lockb', 'bun'], ['bun.lock', 'bun'],
    ['poetry.lock', 'poetry'], ['uv.lock', 'uv'], ['Pipfile.lock', 'pipenv'], ['go.sum', 'go'], ['Cargo.lock', 'cargo'],
  ];
  const packageManagers = new Set(lockfiles.filter(([f]) => has(root, f)).map(([, m]) => m));

  const testFrameworks = new Set();
  for (const t of ['vitest', 'jest', 'mocha', 'ava', 'playwright', '@playwright/test', 'cypress']) if (deps[t]) testFrameworks.add(t.replace('@playwright/test', 'playwright'));
  if (/node --test/.test(pkg?.scripts?.test ?? '')) testFrameworks.add('node:test');
  if (/pytest/.test(pyproject) || has(root, 'pytest.ini')) testFrameworks.add('pytest');
  if (has(root, 'go.mod')) testFrameworks.add('go test');
  if (has(root, 'Cargo.toml')) testFrameworks.add('cargo test');

  const linters = new Set();
  const typecheckers = new Set();
  walk(root, 0, (rel) => {
    if (/^(\.eslintrc(\..+)?|eslint\.config\.[cm]?js)$/.test(rel)) linters.add('eslint');
    if (/^biome\.jsonc?$/.test(rel)) linters.add('biome');
    if (/^\.golangci\.ya?ml$/.test(rel)) linters.add('golangci-lint');
    if (rel === '.flake8') linters.add('flake8');
  });
  if (/\[tool\.ruff/.test(pyproject) || has(root, 'ruff.toml')) linters.add('ruff');
  if (has(root, 'tsconfig.json')) typecheckers.add('tsc');
  if (/\[tool\.mypy/.test(pyproject) || has(root, 'mypy.ini')) typecheckers.add('mypy');

  const commands = detectCommands(root, { pkg, pyproject, packageManagers, languages });

  const ci = new Set();
  if (has(root, '.github/workflows')) ci.add('github-actions');
  if (has(root, '.gitlab-ci.yml')) ci.add('gitlab-ci');
  if (has(root, '.circleci')) ci.add('circleci');
  if (has(root, 'azure-pipelines.yml')) ci.add('azure-pipelines');
  if (has(root, 'Jenkinsfile')) ci.add('jenkins');

  const monorepo = new Set();
  if (pkg?.workspaces) monorepo.add('npm-workspaces');
  for (const [f, k] of [['pnpm-workspace.yaml', 'pnpm'], ['lerna.json', 'lerna'], ['nx.json', 'nx'], ['turbo.json', 'turbo'], ['go.work', 'go-work']]) if (has(root, f)) monorepo.add(k);

  const hostSignals = {
    'claude-code': ['CLAUDE.md', '.claude'],
    codex: ['.codex'],
    'kilo-opencode': ['.opencode', 'opencode.json', 'opencode.jsonc', '.kilo', 'kilo.json', 'kilo.jsonc'],
    cursor: ['.cursor', '.cursorrules', '.cursorignore'],
    'gemini-cli': ['GEMINI.md', '.gemini'],
    copilot: ['.github/copilot-instructions.md', '.github/agents', '.github/instructions'],
  };
  const hostAgents = Object.keys(hostSignals).filter((h) => hostSignals[h].some((f) => has(root, f)));
  const agentFiles = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.cursorrules', '.github/copilot-instructions.md'].filter((f) => has(root, f));

  const sensitivePaths = new Set();
  walk(root, 3, (rel, name, isDir) => {
    if (isDir ? /^(secrets?|credentials|\.ssh)$/i.test(name) : /^(\.env(\..+)?|.*\.(pem|key|p12|pfx)|id_(rsa|ed25519|ecdsa)|credentials.*\.json|.*secret.*\.(json|ya?ml))$/i.test(name)) {
      if (!/\.env\.(example|sample|template)$/i.test(name)) sensitivePaths.add(isDir ? `${rel}/` : rel);
    }
  });

  const remote = git(root, ['remote', 'get-url', 'origin']);
  const remoteHost = remote ? (/^(?:https?:\/\/|ssh:\/\/)?(?:[^@/]+@)?([^/:]+)/.exec(remote)?.[1] ?? null) : null;
  const defaultBranch =
    git(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])?.replace(/^origin\//, '') ??
    (git(root, ['rev-parse', '--is-inside-work-tree']) ? git(root, ['branch', '--show-current']) : null);

  return {
    languages: sorted(languages),
    packageManagers: sorted(packageManagers),
    testFrameworks: sorted(testFrameworks),
    linters: sorted(linters),
    typecheckers: sorted(typecheckers),
    commands,
    ci: sorted(ci),
    monorepo: sorted(monorepo),
    hostAgents,
    agentFiles,
    kms: has(root, 'docs/decisions') || has(root, 'docs/facts'),
    sensitivePaths: sorted(sensitivePaths),
    git: { defaultBranch, remoteHost },
  };
}
