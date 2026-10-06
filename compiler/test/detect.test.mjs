import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { detect } from '../src/detect.mjs';

function fixture(files) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-detect-'));
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    if (rel.endsWith('/')) mkdirSync(path.join(dir, rel), { recursive: true });
    else writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

// Every check of the catalog (decision 0071), unknown.
const none = { format: null, lint: null, typecheck: null, 'static-analysis': null, build: null, test: null, unit: null, integration: null, e2e: null };
const cmds = (known) => ({ ...none, ...known });
const empty = {
  languages: [], packageManagers: [], testFrameworks: [], linters: [], typecheckers: [], commands: none, ci: [], monorepo: [],
  hostAgents: [], agentFiles: [], knowledgeBase: false, sensitivePaths: [], git: { defaultBranch: null, remoteHost: null },
};

test('empty directory', () => {
  const dir = fixture({});
  assert.deepEqual(detect(dir), empty);
  rmSync(dir, { recursive: true, force: true });
});

test('node/typescript repo with host agent files and secrets', () => {
  const dir = fixture({
    'package.json': JSON.stringify({ scripts: { test: 'vitest' }, devDependencies: { vitest: '1', typescript: '5' }, workspaces: ['packages/*'] }),
    'package-lock.json': '{}',
    'tsconfig.json': '{}',
    'eslint.config.js': '',
    '.github/workflows/ci.yml': '',
    '.github/copilot-instructions.md': '',
    'CLAUDE.md': '',
    'AGENTS.md': '',
    '.cursor/': '',
    '.env': 'X=1',
    '.env.example': 'X=',
    'config/secrets/': '',
    'certs/server.key': '',
    'docs/decisions/0001-x.md': '',
  });
  assert.deepEqual(detect(dir), {
    ...empty,
    languages: ['typescript'],
    packageManagers: ['npm'],
    testFrameworks: ['vitest'],
    linters: ['eslint'],
    typecheckers: ['tsc'],
    commands: cmds({ test: 'npm test' }),
    ci: ['github-actions'],
    monorepo: ['npm-workspaces'],
    hostAgents: ['claude-code', 'cursor', 'copilot'],
    agentFiles: ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md'],
    knowledgeBase: true,
    sensitivePaths: ['.env', 'certs/server.key', 'config/secrets/'],
  });
  rmSync(dir, { recursive: true, force: true });
});

test('python repo', () => {
  const dir = fixture({
    'pyproject.toml': '[tool.pytest.ini_options]\n[tool.ruff]\n[tool.mypy]\n',
    'uv.lock': '',
    '.gitlab-ci.yml': '',
    'GEMINI.md': '',
  });
  assert.deepEqual(detect(dir), {
    ...empty,
    languages: ['python'],
    packageManagers: ['uv'],
    testFrameworks: ['pytest'],
    linters: ['ruff'],
    typecheckers: ['mypy'],
    commands: cmds({ test: 'pytest', lint: 'ruff check .', format: 'ruff format --check .', typecheck: 'mypy .' }),
    ci: ['gitlab-ci'],
    hostAgents: ['gemini-cli'],
    agentFiles: ['GEMINI.md'],
  });
  rmSync(dir, { recursive: true, force: true });
});

test('every check of the catalog comes from scripts, Makefile targets and language conventions', () => {
  const cases = [
    [{ 'package.json': JSON.stringify({ scripts: { test: 'vitest', lint: 'eslint .', 'type-check': 'tsc' } }), 'pnpm-lock.yaml': '' }, cmds({ test: 'pnpm test', lint: 'pnpm run lint', typecheck: 'pnpm run type-check' })],
    [{ 'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }) }, none],
    [{ Makefile: 'test:\n\tgo test\nlint:\n\ttrue\n' }, cmds({ test: 'make test', lint: 'make lint' })],
    [{ 'go.mod': 'module x', '.golangci.yml': '' }, cmds({ format: 'test -z "$(gofmt -l .)"', test: 'go test ./...', lint: 'golangci-lint run', typecheck: 'go build ./...', build: 'go build ./...' })],
    [{ 'Cargo.toml': '' }, cmds({ format: 'cargo fmt --check', test: 'cargo test', lint: 'cargo clippy', typecheck: 'cargo check', build: 'cargo build' })],
    [
      {
        'package.json': JSON.stringify({ scripts: { test: 'vitest', format: 'prettier -w .', 'format:check': 'prettier -c .', build: 'tsc -b', 'test:unit': 'vitest unit', 'test:integration': 'vitest int' }, devDependencies: { '@playwright/test': '1' } }),
        Makefile: 'static-analysis:\n\tsemgrep\n',
      },
      cmds({ format: 'npm run format:check', 'static-analysis': 'make static-analysis', build: 'npm run build', test: 'npm test', unit: 'npm run test:unit', integration: 'npm run test:integration', e2e: 'npx playwright test' }),
    ],
    [{ 'package.json': JSON.stringify({ devDependencies: { prettier: '3', cypress: '13' } }), 'yarn.lock': '' }, cmds({ format: 'yarn prettier --check .', e2e: 'yarn cypress run' })],
    [
      { 'pyproject.toml': '[build-system]\n[tool.pytest.ini_options]\n[tool.black]\n[tool.bandit]\n', 'tests/unit/': '', 'tests/e2e/': '' },
      cmds({ format: 'black --check .', 'static-analysis': 'bandit -r .', build: 'python -m build', test: 'pytest', unit: 'pytest tests/unit', e2e: 'pytest tests/e2e' }),
    ],
  ];
  for (const [files, expected] of cases) {
    const dir = fixture(files);
    assert.deepEqual(detect(dir).commands, expected);
    rmSync(dir, { recursive: true, force: true });
  }
});
