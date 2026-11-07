// A run finishes a step's prep itself and hands a person only gated approvals,
// and every skill that asks the person uses the host's selectable-question tool.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOST_TOOLS = /\b(AskUserQuestion|ask_user|request_user_input|TodoWrite)\b/;
const skill = (name) => readFileSync(path.join(root, 'src/skills', name, 'SKILL.md'), 'utf8');

test('autonomous-run does the pre-pull-request skills itself before opening the pull request', () => {
  const text = skill('autonomous-run');
  for (const s of ['go-getter:capture', 'go-getter:conform', 'go-getter:lint', 'go-getter:attribute']) assert.ok(text.includes(s), `names ${s}`);
  assert.match(text, /before (opening )?the pull request/i);
  const at = (s) => text.indexOf(s);
  assert.ok(at('go-getter:capture') < at('go-getter:conform') && at('go-getter:conform') < at('go-getter:attribute'), 'capture, conform, then attribute');
});

test('autonomous-run hands back only gated actions, as approval requests and never as a to-do list', () => {
  const text = skill('autonomous-run');
  assert.match(text, /only (the )?gated/i, 'says only gated actions go to a person');
  assert.match(text, /never (a )?(list|to-do)/i, 'forbids a to-do list for the person');
});

test('every skill that asks the person names the selectable-question tool, and none names a host tool', () => {
  for (const name of ['autonomous-run', 'bootstrap', 'quickstart', 'clarify', 'discover', 'roadmap', 'go-getter-init']) {
    const text = skill(name);
    assert.match(text, /question tool/i, `${name} names the host's question tool`);
    assert.doesNotMatch(text, HOST_TOOLS, `${name} stays neutral`);
  }
});

test('the git-workflow procedure has the agent do its own prep and hand over only gated actions', () => {
  const pack = JSON.parse(readFileSync(path.join(root, 'src/packs/git-workflow/pack.json'), 'utf8'));
  const body = JSON.stringify(pack.practices ?? pack).toLowerCase();
  assert.match(body, /before (opening )?the pull request[^"]*(yourself|itself)|do (the )?(pre-pr )?prep(aration)? yourself/, 'prep is the agent\'s');
  assert.match(body, /only gated|gated actions/, 'a person gets only gated actions');
  assert.match(body, /question tool/, 'asked through the question tool');
});
