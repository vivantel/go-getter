// Conformance of every registered host adapter (plan host-adapters H2, decision 0119): deterministic outputs, owned files
// marked, a missing capability reported and never guessed, and plain data in and out (a JSON round trip changes nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hostIds, getAdapter, hostOp, OPERATIONS } from '../../src/hosts/registry.mjs';
import { HOSTS, loadCapabilities } from '../../src/capabilities.mjs';
import { AGENT_MARKER } from '../../src/hosts/agent-format.mjs';
import { upsert } from '../../src/apply.mjs';

const ROOT = new URL('../../..', import.meta.url).pathname;
const caps = loadCapabilities(ROOT);
const roster = { decision: '0038-agent-roster', handoff: 'Reply with the result.', escalation: 'Stop when blocked.', roles: [] };
const roles = [
  { id: 'reviewer', description: 'Reviews a change', 'task-class': 'review', access: 'read-only', instructions: 'Review.', note: null },
  { id: 'implementer', description: 'Makes a change', 'task-class': 'implement', access: 'write', instructions: 'Implement.', note: 'Run checks.' },
];
const route = { model: 'sonnet', provider: 'anthropic', effort: 'high' };
const roundTrip = (v) => JSON.parse(JSON.stringify(v));
const entry = { matcher: '*', hooks: [{ type: 'command', command: 'x' }] };

test('the registry lists exactly the known hosts', () => {
  assert.deepEqual([...hostIds()].sort(), [...HOSTS].sort());
  assert.equal(getAdapter('nope'), null);
  assert.deepEqual(hostOp('nope', 'agent', {}), { missing: 'host' });
});

for (const host of hostIds()) {
  test(`${host}: implements the interface and describes itself as plain data`, () => {
    const adapter = getAdapter(host);
    for (const op of OPERATIONS) assert.equal(typeof adapter[op], 'function', `${host}.${op}`);
    const d = adapter.describe();
    assert.equal(d.host, host);
    assert.deepEqual(roundTrip(d), d);
    assert.ok(['adapter', 'wrapper'].includes(d.kind));
  });

  test(`${host}: agent files are deterministic, marked as owned and unchanged by a JSON round trip`, () => {
    const capabilities = { agents: caps[host].agents };
    for (const role of roles) {
      const input = { roster, role, route, capabilities };
      const copy = roundTrip(input);
      const first = hostOp(host, 'agent', input);
      assert.deepEqual(input, copy, 'the call does not mutate its input');
      assert.deepEqual(hostOp(host, 'agent', copy), first, 'same output for a round-tripped input');
      assert.deepEqual(hostOp(host, 'agent', input), first, 'deterministic');
      assert.deepEqual(roundTrip(first), first);
      assert.match(first.content, new RegExp(AGENT_MARKER), 'owned file carries the marker');
    }
  });

  test(`${host}: a missing capability is reported, never guessed`, () => {
    assert.deepEqual(hostOp(host, 'agent', { roster, role: roles[0], route, capabilities: {} }), { missing: 'agents' });
  });

  test(`${host}: the other operations take and return plain data`, () => {
    const inputs = {
      hookSettings: { current: { keep: 1 }, plugin: null, events: { preTool: entry, postTool: null, sessionStart: null, sessionEnd: null, stop: null } },
      projectFiles: { instructionFileKept: false },
      respond: { decision: { ask: true, deny: false, reason: 'why' } },
      respondPostTool: { result: { mcp: false, output: 'text' } },
    };
    for (const [op, input] of Object.entries(inputs)) {
      const copy = roundTrip(input);
      const out = hostOp(host, op, input);
      assert.deepEqual(input, copy, `${op} does not mutate its input`);
      assert.deepEqual(roundTrip(out), out, `${op} returns plain data`);
      assert.deepEqual(hostOp(host, op, copy), out, `${op} is deterministic`);
      if (out.missing) assert.equal(typeof out.missing, 'string');
    }
  });
}

test('claude-code: settings keep foreign entries and replace its own; CLAUDE.md links to AGENTS.md', () => {
  const current = { hooks: { PreToolUse: [{ matcher: 'Other', hooks: [] }] }, theme: 'dark' };
  const { file, config } = hostOp('claude-code', 'hookSettings', { current, plugin: null, events: { preTool: { ...entry, hooks: [{ type: 'command', command: 'sh .go-getter/bin/go-getter hook pre-tool' }] }, postTool: null, sessionStart: null, sessionEnd: null, stop: null } });
  assert.equal(file, '.claude/settings.json');
  assert.equal(config.theme, 'dark');
  assert.equal(config.hooks.PreToolUse.length, 2);
  assert.equal(upsert(config.hooks.PreToolUse, null).length, 1);
  assert.deepEqual(hostOp('claude-code', 'projectFiles', { instructionFileKept: false }).outputs, { 'CLAUDE.md': { symlink: 'AGENTS.md' } });
  assert.deepEqual(hostOp('claude-code', 'projectFiles', { instructionFileKept: true }).outputs, {});
});

test('a wrapper leaves hook settings and answers to the core and says so', () => {
  assert.deepEqual(hostOp('codex', 'hookSettings', {}), { missing: 'hookSettings' });
  assert.deepEqual(hostOp('codex', 'respond', { decision: { deny: true, reason: 'x' } }), { missing: 'respond' });
});
