import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { evaluatePreTool } from '../src/hook.mjs';
import { shellOperands, stringLiterals } from '../src/shell.mjs';

// Built at runtime: the restricted names must not appear literally in this file (the hook would deny edits to it).
const ENV = '.' + 'env';
const KEY = 'ke' + 'y';
const DOTKEY = `.${KEY}`;

function project() {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-operands-'));
  mkdirSync(path.join(dir, 'docs/guardrails'), { recursive: true });
  const run = `builtin:deny-path paths=${ENV},${ENV}.*,*${DOTKEY},secrets/**`;
  writeFileSync(path.join(dir, 'docs/guardrails/restricted.md'), `---\nid: restricted\ntitle: restricted\nstatus: active\ndate: 2026-10-05\ntags: [guardrail]\ngo-getter:\n  enforcement:\n    - tier: 2\n      check: "restricted paths"\n      run: "${run}"\n---\n\n## Guardrail\n\nDo not.\n`);
  return dir;
}
const denied = (dir, command) => evaluatePreTool(dir, { tool_name: 'Bash', tool_input: { command } }).deny;
const heredoc = (head, body, delimiter = 'EOF', quote = "'") => `${head} <<${quote}${delimiter}${quote}\n${body}\n${delimiter}`;

test('text that only mentions a restricted path is allowed: messages, echo, heredocs written to a file, attribute access', () => {
  const dir = project();
  try {
    const allowed = [
      `git commit -m "docs: mention ${ENV} and a ${KEY} in the notes"`,
      `git commit -m 'fix the ${ENV} loader'`,
      `echo ${ENV}`,
      `echo "see ${ENV} and item${DOTKEY}"`,
      `printf '%s\\n' ${ENV} item${DOTKEY}`,
      `gh pr create --title "x" --body "uses ${ENV}"`,
      heredoc('cat > notes.md', `the ${ENV} file holds secrets; item${DOTKEY} is a property`),
      heredoc('python3 -', `print(item${DOTKEY})\nvalue = obj${DOTKEY}.name`),
      heredoc('node -', `console.log(item${DOTKEY})`),
      `node -e "console.log(item${DOTKEY})"`,
      `python3 -c "print(a${DOTKEY})"`,
      `git commit -m "$(cat <<'EOF'\nfix: handle the ${ENV} loader (it's a (nested) case)\n\nBody mentions ${ENV} and ${KEY} words.\nEOF\n)"`,
      heredoc('git commit -F -', `a message that names ${ENV}`),
    ];
    for (const command of allowed) assert.equal(denied(dir, command), false, command);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a real access is denied: arguments, redirects, inline code, heredocs fed to a program, substitutions, wrappers', () => {
  const dir = project();
  try {
    const real = [
      `cat ${ENV}`, `cat ./${ENV}`, `cat "${ENV}"`, `cat '${ENV}'`, `cat '.e''nv'`, `head -n1 ${ENV}`, `cp ${ENV} /tmp/x`, `echo x > ${ENV}`, `echo x >> ${ENV}`,
      `cat < ${ENV}`, `cat 2>${ENV}`, `grep SECRET --file=${ENV}`, `tar cf x.tar ${ENV}`, `git add ${ENV}`, `cat secrets/prod/a.txt`, `cat server${DOTKEY}`, `cat a/b/c${DOTKEY}`,
      `cat ${ENV}.local`, `FILE=${ENV} node app.js`, `env FOO=1 cat ${ENV}`, `sudo cat ${ENV}`, `xargs cat < ${ENV}`, `timeout 5 cat ${ENV}`,
      `sh -c 'cat ${ENV}'`, `bash -lc "cat ${ENV}"`, `eval "cat ${ENV}"`, `echo $(cat ${ENV})`, `echo "$(cat ${ENV})"`, `echo \`cat ${ENV}\``, `cat $(echo ${ENV})`, `diff <(cat ${ENV}) other`,
      `python3 -c "print(open('${ENV}').read())"`, `node -e "require('fs').readFileSync('${ENV}')"`, `ruby -e 'puts File.read("${ENV}")'`, `perl -e 'open F, "<${ENV}"'`,
      heredoc('python3 -', `print(open('${ENV}').read())`), heredoc('python3', `from pathlib import Path\nPath("${ENV}").read_text()`), heredoc('node', `require('fs').readFileSync("${ENV}")`),
      heredoc('bash', `cat ${ENV}`), heredoc('sh -s', `cat ${ENV}`), `bash <<EOF\ncat ${ENV}\nEOF`,
      heredoc('cat', `$(cat ${ENV})`, 'EOF', ''), heredoc('cat', `\`cat ${ENV}\``, 'EOF', ''),
      `ls && cat ${ENV}`, `ls; cat ${ENV}`, `ls | xargs cat ${ENV}`, `(cat ${ENV})`, `{ cat ${ENV}; }`, `true || cat ${ENV}`,
      `go-getter secret run --from other -- sh -c 'cat ${ENV}'`, `npx something -- sh -c "cat ${ENV}"`,
    ];
    for (const command of real) assert.equal(denied(dir, command), true, command);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a command that cannot be read falls back to scanning the text, so it is denied when it names a restricted path', () => {
  const dir = project();
  try {
    for (const command of [`cat "${ENV}`, `cat '${ENV}`, `cat <<EOF\n${ENV}`, `cat ${ENV} \\`, `echo $(cat ${ENV}`, `echo "$(cat ${ENV}"`]) {
      assert.equal(shellOperands(command), null, command);
      assert.equal(denied(dir, command), true, command);
    }
    assert.equal(denied(dir, `echo "unterminated`), false, 'unreadable and naming nothing restricted is allowed');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('shellOperands returns the words, redirect targets and code strings that name paths', () => {
  assert.deepEqual(shellOperands('cat a b > c'), ['cat', 'a', 'b', 'c']);
  assert.deepEqual(shellOperands('echo hidden words'), []);
  assert.deepEqual(shellOperands('git commit -m "a b"'), ['git', 'commit', '-m', 'a b']);
  assert.deepEqual(shellOperands('x --from=f'), ['x', '--from=f', 'f']);
  assert.deepEqual(shellOperands("sh -c 'cat f'"), ['sh', '-c', 'cat f', 'cat', 'f']);
  assert.deepEqual(shellOperands('python3 -c "open(\'f\')"'), ['python3', '-c', "open('f')", 'f']);
  assert.deepEqual(shellOperands('echo $(cat f)'), ['cat', 'f']);
  assert.deepEqual(shellOperands('cat <<EOF > out\nbody\nEOF'), ['cat', 'out']);
  assert.deepEqual(shellOperands('cat <<-EOF\n\tbody\n\tEOF\nls x'), ['cat', 'ls', 'x']);
  assert.deepEqual(shellOperands('a 2>&1 | b'), ['a', '1', 'b']);
  assert.deepEqual(shellOperands('a # a comment\nb'), ['a', 'b']);
  assert.deepEqual(stringLiterals(`x = open('a.txt'); y = "b\\"c"; z = \`d\``), ['a.txt', 'b"c', 'd']);
});

test('non-shell tools are scanned as before', () => {
  const dir = project();
  try {
    assert.equal(evaluatePreTool(dir, { tool_name: 'Read', tool_input: { file_path: ENV } }).deny, true);
    assert.equal(evaluatePreTool(dir, { tool_name: 'Read', tool_input: { file_path: 'src/a.js' } }).deny, false);
    assert.equal(evaluatePreTool(dir, { tool_name: 'Bash', tool_input: { command: 'ls', cwd: ENV } }).deny, true, 'another field of a shell call is still scanned');
    assert.equal(evaluatePreTool(dir, { tool_name: 'run_shell_command', tool_input: { command: `cat ${ENV}`, description: 'x' } }).deny, true);
    assert.equal(evaluatePreTool(dir, { tool_name: 'shell', tool_input: { command: ['bash', '-lc', `cat ${ENV}`] } }).deny, true, 'a Codex argv');
    assert.equal(evaluatePreTool(dir, { tool_name: 'shell', tool_input: { command: ['git', 'commit', '-m', `drop ${ENV}`] } }).deny, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
