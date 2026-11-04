// A release request that did nothing can be told from a hook that never ran, from the metadata log alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readLog, summarize } from '../src/telemetry/record.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');

test('the user-prompt hook records that it ran and why it declined, and the summary counts the reasons', () => {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-trace-')));
  mkdirSync(path.join(dir, 'proj'));
  const project = path.join(dir, 'proj');
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: project });
  mkdirSync(path.join(project, 'docs/decisions'), { recursive: true });
  writeFileSync(path.join(project, 'docs/decisions/0001-t.md'), '---\nid: 0001-t\ntitle: t\nstatus: active\ndate: 2026-10-05\ntags: [roadmap]\ngo-getter:\n  telemetry-recording: metadata-log\n---\n\n## Decision\n\nx\n');
  try {
    const run = (input, attended) => spawnSync(process.execPath, [cli, 'hook', 'user-prompt', '--host', 'claude-code', '--project', project], {
      input, encoding: 'utf8', env: { ...process.env, CLAUDE_CODE_SESSION_ATTENDED: attended, GO_GETTER_HOME: path.join(dir, 'home') },
    });
    const a = run(JSON.stringify({ prompt: 'release', session_id: 's', cwd: project }), '0');
    assert.equal(a.status, 0);
    assert.equal(a.stdout, '', 'prints nothing');
    run(JSON.stringify({ prompt: 'what does this do?', session_id: 's', cwd: project }), '1');
    run('not json', '1');
    const s = summarize(readLog(project));
    assert.equal(s.events['user-prompt'], 3);
    assert.equal(s.triggers['release-request:unattended'], 1);
    assert.equal(s.triggers['user-prompt:unreadable-payload'], 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
