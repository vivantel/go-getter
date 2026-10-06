import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createWatcher, resolveLevel, stateKey, formatDuration, wrapWatch } from '../src/watch.mjs';

const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'go-getter.mjs');
const STATES = ['queued', 'in_progress: build', 'in_progress: test', 'in_progress: deploy', 'completed: success'];

// 200 lines over 5 states, with a poll counter that changes every line.
const stream = () => Array.from({ length: 200 }, (_, i) => `run 42 ${STATES[Math.floor(i / 40)]} (poll ${i}, ${i * 5}s)`);

// A fake clock whose timers fire as time advances.
function clock() {
  let t = 0;
  let timers = [];
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const timer = { at: t + ms, fn };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { timers = timers.filter((x) => x !== timer); },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = timers.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((x) => x !== due);
        t = due.at;
        due.fn();
      }
      t = end;
    },
  };
}

function feed(opts, { stepMs = 0, lines = stream(), result = { code: 0 } } = {}) {
  const c = clock();
  const out = [];
  const w = createWatcher({ ...opts, write: (s) => out.push(s), now: c.now, setTimer: c.setTimer, clearTimer: c.clearTimer });
  for (const l of lines) {
    w.line(l);
    c.advance(stepMs);
  }
  const summary = w.finish(result);
  return { out, summary };
}

test('stateKey ignores counters and timings', () => {
  assert.equal(stateKey('run 42 queued (poll 1, 5s)'), stateKey('run 42 queued (poll 17, 85s)'));
  assert.notEqual(stateKey('run 42 queued'), stateKey('run 42 completed'));
});

test('quiet emits at most the state changes and a summary', () => {
  for (const stepMs of [0, 1000, 30_000]) {
    const { out, summary } = feed({ level: 'quiet' }, { stepMs });
    const [last, ...rest] = [...out].reverse();
    assert.match(last, /^watch: ok in /);
    assert.ok(rest.length <= 5, `${rest.length} notifications at ${stepMs}ms per line`);
    assert.equal(new Set(rest.map(stateKey)).size, rest.length, 'no duplicate states');
    assert.equal(summary.lines, 200);
    assert.equal(summary.states, 5);
  }
});

test('quiet with slow polling reports every state change', () => {
  const { out } = feed({ level: 'quiet' }, { stepMs: 30_000 });
  assert.equal(out.length, 6);
  assert.deepEqual(out.slice(0, 5).map((l) => STATES.find((s) => l.includes(s))), STATES);
});

test('quiet collapses a burst into its latest state and reports it in the summary', () => {
  const { out } = feed({ level: 'quiet' }, { stepMs: 0 });
  assert.equal(out.length, 2);
  assert.match(out[0], /queued/);
  assert.match(out[1], /\n {2}last: .*completed: success/);
});

test('the per-hour cap holds output with one notice', () => {
  const lines = Array.from({ length: 40 }, (_, i) => `state ${String.fromCharCode(97 + (i % 26))}${i >= 26 ? 'x' : ''}`);
  const { out } = feed({ level: 'quiet' }, { stepMs: 61_000, lines });
  const notices = out.filter((l) => l.includes('notifications this hour'));
  assert.equal(notices.length, 1);
  assert.equal(out.length, 6 + 1 + 1);
});

test('verbose only dedupes exact repeats', () => {
  const { out } = feed({ level: 'verbose' }, { lines: ['a 1', 'a 1', 'a 2', 'b', 'b'] });
  assert.deepEqual(out.slice(0, -1), ['a 1', 'a 2', 'b']);
});

test('--until done emits exactly one line group with the failure tail', () => {
  const ok = feed({ level: 'quiet', until: true, command: 'gh run watch' }, { stepMs: 1000 });
  assert.equal(ok.out.length, 1);
  assert.match(ok.out[0], /^watch: ok in 3m 20s \(exit 0\): gh run watch$/);
  const failed = feed({ level: 'quiet', until: true }, { stepMs: 1000, result: { code: 1 } });
  assert.equal(failed.out.length, 1);
  const group = failed.out[0].split('\n');
  assert.match(group[0], /^watch: failed in 3m 20s \(exit 1\)/);
  assert.equal(group.length, 1 + 15);
  assert.match(group.at(-1), /poll 199/);
});

test('formatDuration', () => {
  assert.equal(formatDuration(4_400), '4s');
  assert.equal(formatDuration(125_000), '2m 05s');
  assert.equal(formatDuration(3_780_000), '1h 03m');
});

test('the level comes from the flag, then the adopted decision, then quiet', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-watch-'));
  try {
    assert.equal(resolveLevel(dir), 'quiet');
    mkdirSync(path.join(dir, 'docs', 'decisions'), { recursive: true });
    writeFileSync(
      path.join(dir, 'docs', 'decisions', '0001-noise.md'),
      '---\nid: 0001-noise\ntitle: Noise\nstatus: active\ndate: 2026-10-05\ntags: [x]\ngo-getter:\n  watcher-noise: normal\n---\n\nx\n',
    );
    assert.equal(resolveLevel(dir), 'normal');
    assert.equal(resolveLevel(dir, 'verbose'), 'verbose');
    assert.throws(() => resolveLevel(dir, 'loud'), /unknown noise level/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('go-getter watch --until done prints one result and keeps the exit code', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-watch-'));
  try {
    const script = 'for (let i = 0; i < 200; i++) console.log("line " + i); console.error("boom"); process.exit(3)';
    const run = spawnSync(process.execPath, [cli, 'watch', '--until', 'done', '--', process.execPath, '-e', script], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 3);
    const lines = run.stdout.trimEnd().split('\n');
    assert.equal(lines.filter((l) => l.startsWith('watch:')).length, 1);
    assert.match(lines[0], /^watch: failed in \d+s \(exit 3\)/);
    assert.equal(lines.length, 16);
    assert.ok(lines.includes('  boom'));
    const shell = spawnSync(process.execPath, [cli, 'watch', '--', 'echo one; echo two'], { cwd: dir, encoding: 'utf8' });
    assert.equal(shell.status, 0);
    assert.deepEqual(shell.stdout.trimEnd().split('\n'), ['one', 'watch: ok in 0s (exit 0; 2 lines, 2 states, 1 notified): echo one; echo two', '  last: two']);
    assert.equal(spawnSync(process.execPath, [cli, 'watch', 'echo'], { encoding: 'utf8' }).status, 2);
    assert.equal(spawnSync(process.execPath, [cli, 'watch', '--noise', 'loud', '--', 'true'], { cwd: dir, encoding: 'utf8' }).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const GUARDRAIL = '---\nid: watches-use-the-wrapper\ntitle: Watches\nstatus: active\ndate: 2026-10-05\ntags: [x]\n---\n\nx\n';
const monitor = (command) => ({ tool_name: 'Monitor', tool_input: { command, description: 'd', timeout_ms: 5000 } });

function wrapperProject(adopted = true) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-watch-'));
  mkdirSync(path.join(dir, 'docs', 'guardrails'), { recursive: true });
  if (adopted) writeFileSync(path.join(dir, 'docs', 'guardrails', 'watches-use-the-wrapper.md'), GUARDRAIL);
  return dir;
}

test('the pre-tool hook wraps a host watcher command once the wrapper guardrail is adopted', () => {
  const dir = wrapperProject();
  try {
    const out = wrapWatch(dir, 'claude-code', monitor("gh run watch 'x'"));
    assert.equal(out.rewrite.input.command, `sh '${path.join(dir, '.go-getter', 'bin', 'go-getter')}' watch -- 'gh run watch '\\''x'\\'''`);
    assert.equal(out.rewrite.input.timeout_ms, 5000);
    assert.equal(wrapWatch(dir, 'claude-code', monitor(out.rewrite.input.command)), null, 'already wrapped');
    assert.equal(wrapWatch(dir, 'claude-code', monitor('npx go-getter watch --until done -- npm test')), null);
    assert.equal(wrapWatch(dir, 'claude-code', { tool_name: 'Monitor', tool_input: { ws: { url: 'wss://x' } } }), null, 'WebSocket watch');
    assert.equal(wrapWatch(dir, 'claude-code', { tool_name: 'Bash', tool_input: { command: 'ls' } }), null);
    assert.equal(wrapWatch(dir, 'codex', monitor('tail -f log')), null, 'host without a watcher tool');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const bare = wrapperProject(false);
  try {
    assert.equal(wrapWatch(bare, 'claude-code', monitor('tail -f log')), null, 'not adopted');
  } finally {
    rmSync(bare, { recursive: true, force: true });
  }
});

test('go-getter hook pre-tool answers a watcher call with a command that runs through the wrapper', () => {
  const dir = wrapperProject();
  try {
    mkdirSync(path.join(dir, '.go-getter', 'bin'), { recursive: true });
    writeFileSync(path.join(dir, '.go-getter', 'bin', 'go-getter'), `exec "${process.execPath}" "${cli}" "$@"\n`);
    const hook = spawnSync(process.execPath, [cli, 'hook', 'pre-tool', '--host', 'claude-code', '--project', dir], {
      cwd: dir,
      input: JSON.stringify({ ...monitor("echo 'it''s' done"), cwd: dir }),
      encoding: 'utf8',
    });
    assert.equal(hook.status, 0);
    const out = JSON.parse(hook.stdout).hookSpecificOutput;
    assert.equal(out.permissionDecision, 'allow');
    const run = spawnSync('sh', ['-c', out.updatedInput.command], { cwd: dir, encoding: 'utf8' });
    assert.equal(run.status, 0);
    assert.equal(run.stdout, "its done\nwatch: ok in 0s (exit 0; 1 lines, 1 states, 1 notified): echo 'it''s' done\n");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
