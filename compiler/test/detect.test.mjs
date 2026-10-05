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

const empty = {
  languages: [], packageManagers: [], testFrameworks: [], linters: [], typecheckers: [], ci: [], monorepo: [],
  hostAgents: [], agentFiles: [], kms: false, sensitivePaths: [], git: { defaultBranch: null, remoteHost: null },
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
    ci: ['github-actions'],
    monorepo: ['npm-workspaces'],
    hostAgents: ['claude-code', 'cursor', 'copilot'],
    agentFiles: ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md'],
    kms: true,
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
    ci: ['gitlab-ci'],
    hostAgents: ['gemini-cli'],
    agentFiles: ['GEMINI.md'],
  });
  rmSync(dir, { recursive: true, force: true });
});
