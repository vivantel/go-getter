import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evaluatePreTool } from '../src/hook.mjs';
import { storeDir } from '../src/secrets/approvals.mjs';

// H4: the policy files and the approvals store are not agent-writable. The project adopts no guardrail about either: the
// protection is built in, so removing a guardrail file cannot switch it off.
const doc = (kind, id, status) => `---\nid: ${id}\ntitle: ${id}\nstatus: ${status}\ndate: 2026-10-05\ntags: [${kind}]\n---\n\nbody\n`;

function setup() {
  const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gg-policywrite-')));
  const dir = path.join(base, 'proj');
  for (const rel of ['docs/guardrails', 'docs/decisions', 'docs/facts', 'src']) mkdirSync(path.join(dir, rel), { recursive: true });
  writeFileSync(path.join(dir, 'docs/guardrails/no-secrets.md'), doc('guardrail', 'no-secrets', 'active'));
  writeFileSync(path.join(dir, 'docs/guardrails/old-rule.md'), doc('guardrail', 'old-rule', 'superseded'));
  writeFileSync(path.join(dir, 'docs/decisions/0001-accepted.md'), doc('decision', '0001-accepted', 'accepted'));
  writeFileSync(path.join(dir, 'docs/decisions/0002-draft.md'), doc('decision', '0002-draft', 'draft'));
  writeFileSync(path.join(dir, 'docs/facts/0001-fact.md'), doc('fact', '0001-fact', 'active'));
  const saved = process.env.GO_GETTER_HOME;
  process.env.GO_GETTER_HOME = path.join(base, 'home');
  return {
    dir,
    ask: (payload, host = 'claude-code') => evaluatePreTool(dir, payload, host),
    cleanup: () => {
      saved === undefined ? delete process.env.GO_GETTER_HOME : (process.env.GO_GETTER_HOME = saved);
      rmSync(base, { recursive: true, force: true });
    },
  };
}
const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const stops = (r) => Boolean(r.deny || r.ask);

test('a write to an active guardrail or an accepted decision is asked on a host that can ask, denied on one that cannot', () => {
  const s = setup();
  try {
    for (const payload of [
      { tool_name: 'Write', tool_input: { file_path: 'docs/guardrails/no-secrets.md', content: 'x' } },
      { tool_name: 'Edit', tool_input: { file_path: path.join(s.dir, 'docs/guardrails/no-secrets.md'), old_string: 'active', new_string: 'superseded' } },
      { tool_name: 'Write', tool_input: { file_path: 'docs/decisions/0001-accepted.md', content: 'x' } },
    ]) {
      const r = s.ask(payload);
      assert.equal(r.ask, true, `${payload.tool_name} ${payload.tool_input.file_path}: ${JSON.stringify(r)}`);
      assert.equal(s.ask(payload, 'none').deny, true, 'a host that cannot ask is denied');
    }
  } finally {
    s.cleanup();
  }
});

test('a shell write into an active guardrail is stopped: sed -i, redirects, tee, cp, mv, rm, a cd first', () => {
  const s = setup();
  try {
    for (const command of [
      "sed -i 's/active/superseded/' docs/guardrails/no-secrets.md",
      'echo "free=git push" >> docs/guardrails/no-secrets.md',
      'printf x > docs/guardrails/no-secrets.md',
      'echo x | tee docs/guardrails/no-secrets.md',
      'cp /dev/null docs/guardrails/no-secrets.md',
      'mv src/x docs/guardrails/no-secrets.md',
      'rm docs/guardrails/no-secrets.md',
      'cd docs/guardrails && sed -i s/active/superseded/ no-secrets.md',
      'cd docs/guardrails && echo x > no-secrets.md',
      'sh -c "echo x > docs/guardrails/no-secrets.md"',
    ]) assert.equal(stops(s.ask(bash(command))), true, command);
  } finally {
    s.cleanup();
  }
});

test('reading a guardrail, writing a draft or superseded file, a fact or source, and prose that names the path pass', () => {
  const s = setup();
  try {
    for (const payload of [
      { tool_name: 'Read', tool_input: { file_path: 'docs/guardrails/no-secrets.md' } },
      { tool_name: 'Write', tool_input: { file_path: 'docs/guardrails/brand-new.md', content: 'x' } },
      { tool_name: 'Write', tool_input: { file_path: 'docs/guardrails/old-rule.md', content: 'x' } },
      { tool_name: 'Write', tool_input: { file_path: 'docs/decisions/0002-draft.md', content: 'x' } },
      { tool_name: 'Write', tool_input: { file_path: 'docs/facts/0001-fact.md', content: 'x' } },
      { tool_name: 'Write', tool_input: { file_path: 'src/a.mjs', content: 'see docs/guardrails/no-secrets.md' } },
      bash('cat docs/guardrails/no-secrets.md'),
      bash('grep -r active docs/guardrails'),
      bash('git diff -- docs/guardrails/no-secrets.md'),
      bash('git commit -m "docs: edit docs/guardrails/no-secrets.md"'),
      bash('echo x > src/out.txt'),
    ]) assert.equal(stops(s.ask(payload)), false, JSON.stringify(payload));
  } finally {
    s.cleanup();
  }
});

test('the approvals store cannot be reached by a cd first, a relative name or a pushd', () => {
  const s = setup();
  try {
    const store = storeDir();
    for (const command of [
      `cd ${store} && cp x approvals.json`,
      `cd ${store}; echo '{}' > approvals.json`,
      `cd ${store} && node -e "require('fs').writeFileSync('approvals.json', '{}')"`,
      `pushd ${store} >/dev/null && cp x pending.json`,
      `cd ${path.dirname(store)} && cp x ${path.basename(store)}/approvals.json`,
      `node -e "require('fs').writeFileSync(require('path').join('${path.dirname(store)}', '${path.basename(store)}', 'approvals.json'), '{}')"`,
    ]) assert.equal(s.ask(bash(command)).deny, true, command);
    for (const command of ['cd src && ls', 'cd .. && ls', `echo ${path.basename(store)}`]) assert.equal(stops(s.ask(bash(command))), false, command);
  } finally {
    s.cleanup();
  }
});
