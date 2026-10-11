// Shared tier-2 hook runtime: every host's pre-tool hook calls `go-getter hook pre-tool --host <id>`.
// Evaluates the project's tier-2 guardrail entries against the tool call and answers in the host's format.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { collectEnforcement } from './enforce.mjs';
import { matchesAny } from './glob.mjs';
import { FIELDS } from './telemetry/schema.mjs';
import { patternsOf } from './checks/builtin/deny-path.mjs';
import { adoptedData, packageCapabilities } from './governance.mjs';
import { driftNudge } from './manifest.mjs';
import { matchGated, gateArgs, isRegexExtra } from './gate.mjs';
import { checkpointBeforeCommand } from './checkpoint-trigger.mjs';
import { redactionRegexes } from './secrets/patterns.mjs';
import { piiConfig, sessionKeyOf, maskPii } from './secrets/mask.mjs';
import { createPseudonymizer, cleanupSession, sweepPseudonyms } from './secrets/pseudonyms.mjs';

const METADATA = new Set(['session_id', 'transcript_path', 'cwd', 'hook_event_name', 'permission_mode', 'model', 'model_id', 'model_params', 'conversation_id', 'generation_id', 'cursor_version', 'workspace_roots', 'user_email', 'turn_id', 'tool_use_id', 'agent_id', 'agent_type', 'prompt_id', 'scratchpad_dir', 'effort']);

// Prose fields of the tools go-getter knows, by kind: they carry text for a model or a file body, never a path to reach.
// Every other field of a known tool is still scanned, so an unexpected field only adds false positives.
const PROSE = {
  file: ['content', 'contents', 'file_text', 'old_string', 'new_string', 'oldString', 'newString', 'old_str', 'new_str', 'edits'],
  shell: ['description'],
  search: ['pattern'],
  fetch: ['prompt'],
  websearch: ['query'],
  delegate: ['prompt', 'description', 'message', 'summary'],
  ask: ['questions'],
  skill: ['args'],
  todo: ['todos'],
  memory: ['fact'],
};
// Tool names (lowercased) of every host the shared runtime serves, mapped to their kind. A name not listed is unknown:
// all of its input is scanned. Shell commands stay tokenised whole, so a restricted name anywhere in one is denied.
// Codex, Cursor and Copilot names are confirmed by fact 0031; their argument field names mostly are not.
const TOOLS = {
  // file read, write and edit tools; `apply_patch` carries its patch (paths included) in `command`, scanned whole
  read: 'file', write: 'file', edit: 'file', multiedit: 'file', notebookedit: 'file', read_file: 'file', write_file: 'file',
  replace: 'file', read_many_files: 'file', view: 'file', create: 'file', str_replace_editor: 'file', delete: 'file',
  apply_patch: 'file',
  // shell tools
  bash: 'shell', shell: 'shell', run_shell_command: 'shell', powershell: 'shell',
  // content search: the pattern is a regex over file bodies; the path, glob and include fields are scanned
  grep: 'search', search_file_content: 'search', grep_search: 'search', rg: 'search',
  // web fetch and web search
  webfetch: 'fetch', web_fetch: 'fetch', websearch: 'websearch', google_web_search: 'websearch', web_search: 'websearch',
  // delegation to another agent
  agent: 'delegate', task: 'delegate', spawn_agent: 'delegate', sendmessage: 'delegate',
  // questions put to the user and skill arguments are text, not paths a tool opens (the `skill` name is still scanned)
  askuserquestion: 'ask', skill: 'skill',
  todowrite: 'todo', write_todos: 'todo', update_todo: 'todo', save_memory: 'memory',
};

const toolName = (payload) => {
  const name = payload.tool_name ?? payload.toolName;
  return typeof name === 'string' ? name : undefined;
};

// The tool input: the host's input field (Copilot sends `toolArgs` as JSON text), else the payload without metadata.
function toolInput(payload) {
  const input = payload.tool_input ?? payload.toolInput ?? payload.args ?? payload.toolArgs;
  if (typeof input === 'string') {
    try {
      return JSON.parse(input);
    } catch {
      return input;
    }
  }
  return input ?? Object.fromEntries(Object.entries(payload).filter(([k]) => !METADATA.has(k)));
}

// Strings a tool call could use to reach a path: the input values of the tool, minus the prose fields of a known tool,
// split into shell-ish tokens. An unknown tool has every input value scanned.
export function candidatePaths(payload, project) {
  let source = toolInput(payload);
  const kind = TOOLS[toolName(payload)?.toLowerCase()];
  if (kind && source && typeof source === 'object' && !Array.isArray(source)) {
    source = Object.fromEntries(Object.entries(source).filter(([k]) => !PROSE[kind].includes(k)));
  }
  const strings = [];
  const walk = (v) => {
    if (typeof v === 'string') strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(source);
  const tokens = new Set();
  for (const s of strings) {
    for (const raw of s.split(/[\s"'`;|&<>()=,]+/)) {
      if (!raw) continue;
      const rel = path.isAbsolute(raw) && project ? path.relative(project, raw) : raw;
      tokens.add(rel.replace(/^\.\//, ''));
    }
  }
  return [...tokens];
}

// Access modes of restricted patterns (decision 0072) from `go-getter.restricted-modes` ("use:<pattern>, sink:<pattern>").
// A pattern not listed, or listed under both modes, is `deny`.
export function restrictedModes(project) {
  const modes = new Map();
  for (const entry of String(adoptedData(project, 'restricted-modes') ?? '').split(',')) {
    const m = /^(use|sink):(\S+)$/.exec(entry.trim());
    if (m) modes.set(m[2], modes.has(m[2]) && modes.get(m[2]) !== m[1] ? 'deny' : m[1]);
  }
  return modes;
}

// A path's mode: `deny` if a restricted pattern it matches is `deny` or its patterns disagree.
function modeOf(file, patterns, modes) {
  const found = new Set(patterns.filter((p) => matchesAny(file, [p])).map((p) => modes.get(p) ?? 'deny'));
  return found.size === 1 ? [...found][0] : 'deny';
}

// The access mode of a project file (a path relative to the project root): `deny` unless every restricted pattern it
// matches is `use` (or every one is `sink`). A file no restricted pattern matches is `deny` too: it is not a secret to pass.
export function pathMode(project, file) {
  const patterns = restrictedPatterns(project).filter((p) => matchesAny(file, [p]));
  return patterns.length ? modeOf(file, patterns, restrictedModes(project)) : 'deny';
}

// `run` or `put` when the call is a shell command that is exactly `go-getter secret run|put <args>`: one simple command
// of plain words (no quoting, expansion, chaining or redirection), so nothing else runs in it. Never a substring match.
const SECRET_MODE = { run: 'use', put: 'sink' };
const WORD = '[A-Za-z0-9_./=:@%+,-]+';
export function secretSubcommand(payload) {
  if (TOOLS[toolName(payload)?.toLowerCase()] !== 'shell') return undefined;
  const command = toolInput(payload)?.command;
  if (typeof command !== 'string' || !new RegExp(`^${WORD}( ${WORD})*$`).test(command)) return undefined;
  const [bin, group, sub] = command.split(' ');
  return bin === 'go-getter' && group === 'secret' && Object.hasOwn(SECRET_MODE, sub) ? sub : undefined;
}

// What a `go-getter secret run|put` call may name: paths of its mode in its command. Null for any other call.
function exemption(project, payload) {
  const sub = secretSubcommand(payload);
  if (!sub) return null;
  const command = toolInput(payload).command;
  return { mode: SECRET_MODE[sub], modes: restrictedModes(project), names: new Set(candidatePaths({ tool_name: 'bash', tool_input: { command } }, project)) };
}

// Hosts with a native ask rule prompt the human themselves (decision 0094), so the hook gates only the others (and, on every host, the `/regex/` extras, which have no native rule).
let capabilities;
const hasNativeAsk = (host) => Boolean((capabilities ??= packageCapabilities())[host]?.permissions?.ask);

// The command of a shell tool call as text: a Codex-style argv of `sh -c <script>` is its script.
function shellCommand(payload) {
  if (TOOLS[toolName(payload)?.toLowerCase()] !== 'shell') return undefined;
  const input = toolInput(payload);
  const command = typeof input === 'string' ? input : input?.command ?? input?.cmd;
  if (Array.isArray(command)) return /^-\w*c$/.test(command[1] ?? '') ? String(command.at(-1)) : command.join(' ');
  return typeof command === 'string' ? command : undefined;
}

// `{ command, class }` when a `gate-command` entry gates this call on this host, else null. Without a known host the call
// is not gated: whether the host prompts natively cannot be told. A host with native ask rules prompts for the catalog and
// the prefix extras; a `/regex/` extra has no native rule there, so the hook gates only those.
function gatedCommand(entry, payload, host) {
  if (!host) return null;
  const command = shellCommand(payload);
  if (!command) return null;
  const args = gateArgs(entry.parsed.args);
  let hit;
  try {
    hit = matchGated(command, hasNativeAsk(host) ? { classes: [], extra: args.extra.filter(isRegexExtra) } : args)[0];
  } catch {
    return null; // an invalid pattern gates nothing here rather than breaking every shell call; `apply` rejects it
  }
  return hit ? { command: command.length > 200 ? `${command.slice(0, 200)}…` : command, class: hit.class } : null;
}

// A `use` path may be named only by a call that is exactly `go-getter secret run`, and a `sink` path only by one that is
// exactly `go-getter secret put` (decisions 0072 and 0107); every other call that names one is denied like a `deny` path.
export function evaluatePreTool(project, payload, host) {
  let exempt;
  const enforcement = collectEnforcement(project);
  checkpointBeforeCommand(project, enforcement, shellCommand(payload), host); // best effort, before the decision, never changes it
  for (const e of enforcement) {
    if (e.tier !== 2 || e.parsed?.kind !== 'builtin') continue;
    if (e.parsed.id === 'gate-command') {
      const gated = gatedCommand(e, payload, host);
      if (gated) return { deny: true, reason: `blocked by guardrail ${e.guardrail}: "${gated.command}" is an ${gated.class} command and needs a human; ask the user to run it themselves` };
      continue;
    }
    if (e.parsed.id === 'deny-path') {
      const patterns = patternsOf(e.parsed.args);
      const hits = candidatePaths(payload, project).filter((p) => matchesAny(p, patterns));
      if (hits.length && exempt === undefined) exempt = exemption(project, payload);
      const allowed = (p) => exempt && exempt.names.has(p) && modeOf(p, patterns, exempt.modes) === exempt.mode;
      const hit = hits.find((p) => !allowed(p));
      if (hit) return { deny: true, reason: `blocked by guardrail ${e.guardrail}: ${toolName(payload) ?? 'tool call'} names "${hit}", a denied path` };
    }
  }
  return { deny: false };
}

// Tier-2 tool-output redaction (decision 0072): `go-getter hook post-tool` replaces secrets in a tool result with
// REDACTED where the host can replace output (capability hooks.rewriteOutput). Heuristic, like every hook layer.
export const REDACTED = '[redacted by go-getter]';
// A value shorter than this (`true`, `3000`) is left alone: redacting it would scramble ordinary output.
const MIN_VALUE = 8;
const MAX_FILE = 256 * 1024;
const SKIP_DIRS = new Set(['.git', 'node_modules']);

// Restricted patterns of the adopted tier-2 deny-path guardrails.
function restrictedPatterns(project) {
  return collectEnforcement(project)
    .filter((e) => e.tier === 2 && e.parsed?.kind === 'builtin' && e.parsed.id === 'deny-path')
    .flatMap((e) => patternsOf(e.parsed.args));
}

// Values of the `KEY=value` lines of every restricted file in the project. All modes count: the model sees no value of a
// `use` or `sink` file either, since `secret run` scrubs a command's output and `secret put` prints none.
export function restrictedValues(project, patterns = restrictedPatterns(project)) {
  const values = new Set();
  if (!patterns.length) return values;
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!SKIP_DIRS.has(ent.name)) walk(abs);
        continue;
      }
      if (!ent.isFile() || !matchesAny(path.relative(project, abs), patterns)) continue;
      try {
        if (statSync(abs).size > MAX_FILE) continue;
        for (const line of readFileSync(abs, 'utf8').split(/\r?\n/)) {
          const m = /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_.-]*\s*=\s*(.*?)\s*$/.exec(line);
          if (!m) continue;
          const value = m[1].replace(/^(["'])(.*)\1$/, '$2');
          if (value.length >= MIN_VALUE) values.add(value);
        }
      } catch {
        // an unreadable file has no values to leak
      }
    }
  };
  walk(project);
  return values;
}

// Redacts one string: restricted values first (longest first, so a value inside another goes with it), then patterns.
export function redactText(text, values) {
  let count = 0;
  let out = text;
  for (const v of [...values].sort((a, b) => b.length - a.length)) {
    const parts = out.split(v);
    count += parts.length - 1;
    out = parts.join(REDACTED);
  }
  for (const re of redactionRegexes()) {
    out = out.replace(re, () => {
      count++;
      return REDACTED;
    });
  }
  return { text: out, count };
}

// Redacts every string in a tool result, keeping its shape so the host accepts it as a replacement: restricted values and
// secret patterns become REDACTED; where the project masks PII (decision 0106), email, card numbers, IBANs and the
// classes it adds become per-session pseudonyms. `masked` counts what was replaced per kind, never what it was.
export function evaluatePostTool(project, payload) {
  const response = payload.tool_response ?? payload.toolResponse ?? payload.tool_output ?? payload.toolResult;
  const values = restrictedValues(project);
  const pii = piiConfig(project);
  const masked = {};
  let redactions = 0;
  let pseudonymizer = null;
  const walk = (v) => {
    if (typeof v === 'string') {
      const r = redactText(v, values);
      redactions += r.count;
      if (r.count) masked.secret = (masked.secret ?? 0) + r.count;
      if (!pii) return r.text;
      pseudonymizer ??= createPseudonymizer(project, sessionKeyOf(payload));
      const m = maskPii(r.text, { classes: pii.classes, pseudonymizer });
      for (const [kind, n] of Object.entries(m.kinds)) {
        masked[kind] = (masked[kind] ?? 0) + n;
        redactions += n;
      }
      return m.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  let output;
  try {
    output = walk(response);
  } finally {
    pseudonymizer?.close();
  }
  if (pii) sweepPseudonyms(project);
  return { output, redactions, masked, mcp: /^mcp__/.test(toolName(payload) ?? '') };
}

// A session ended: its pseudonym map goes (a host that never sends this leaves the 24-hour sweep).
export function evaluateSessionEnd(project, payload) {
  cleanupSession(project, sessionKeyOf(payload));
  return { ended: true };
}

// Host-specific post-tool answer: replace the result only when something was redacted. Only hosts with
// hooks.rewriteOutput get this hook installed; any other host answers nothing.
// Shapes (fact 0031): Claude Code and Copilot replace the result in place; Codex and Gemini CLI replace it with the
// text of a block decision's reason; the Kilo plugin sets `output.output` from `{ output }`.
export function respondPostTool(host, result) {
  const none = { code: 0, stdout: '', stderr: '' };
  if (!result.redactions) return none;
  const text = (v) => (typeof v === 'string' ? v : JSON.stringify(v));
  const answer = (value) => ({ code: 0, stdout: JSON.stringify(value), stderr: '' });
  const out = result.output;
  if (host === 'claude-code') {
    const key = result.mcp ? 'updatedMCPToolOutput' : 'updatedToolOutput';
    return answer({ hookSpecificOutput: { hookEventName: 'PostToolUse', [key]: out } });
  }
  if (host === 'copilot') return answer({ modifiedResult: { resultType: 'success', textResultForLlm: text(out?.textResultForLlm ?? out) } });
  if (host === 'codex') return answer({ decision: 'block', reason: text(out) });
  if (host === 'gemini-cli') return answer({ decision: 'deny', reason: text(out?.llmContent ?? out) });
  if (host === 'kilo') return answer({ output: text(out) });
  return none;
}

// Host-specific answer: exit 2 + stderr where that blocks; Copilot reads a JSON decision.
export function respond(host, decision) {
  if (!decision.deny) return { code: 0, stdout: '', stderr: '' };
  if (host === 'copilot') return { code: 0, stdout: JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: decision.reason }), stderr: '' };
  return { code: 2, stdout: '', stderr: decision.reason };
}

// Session start: run vendored nudge scripts (POSIX sh, plain-text output) in the project; failures are silent.
export const NUDGES = ['capture-nudge.sh', 'lint-nudge.sh'];
// Nudge output enters context on every session start (decision 0070), so it has a fixed line budget.
export const NUDGE_LINE_BUDGET = 20;

export function capLines(text, budget = NUDGE_LINE_BUDGET) {
  const lines = text ? text.split('\n') : [];
  if (lines.length <= budget) return text;
  return [...lines.slice(0, budget - 1), `… ${lines.length - budget + 1} more nudge lines cut`].join('\n');
}

export function sessionNudges(packageRoot, project) {
  const lines = [];
  for (const script of NUDGES) {
    const file = path.join(packageRoot, 'src/hooks', script);
    if (!existsSync(file)) continue;
    try {
      const out = execFileSync('sh', [file], { cwd: project, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }).trim();
      if (out) lines.push(out);
    } catch {
      // a nudge must never block a session
    }
  }
  try {
    const drift = driftNudge(project, packageRoot);
    if (drift) lines.push(drift);
  } catch {
    // a nudge must never block a session
  }
  return capLines(lines.join('\n'));
}

// Token and cost fields a host's hook payload carries (decision 0087). Only Claude Code documents any: a resumed
// session-start brings the context size, whether its prompt cache likely expired, and the estimated cache-write cost.
export function payloadUsage(payload) {
  const n = payload.context_tokens;
  if (!Number.isInteger(n) || n < 0) return {};
  const expired = payload.prompt_cache_likely_expired === true;
  const usage = { tokens: expired ? { cacheWrite: n } : { cacheRead: n } };
  if (expired && FIELDS.cost(payload.estimated_cache_write_usd)) usage.cost = payload.estimated_cache_write_usd;
  return usage;
}

// Telemetry record for a hook event: metadata the host's payload carries (model, effort, tokens, cost), never tool
// input or output. A post-tool event adds only the count of redactions.
export function hookRecord(event, host, payload, decision, redactions, masked) {
  const rec = { event };
  if (host) rec.host = host;
  const model = typeof payload.model === 'string' ? payload.model : payload.model?.id;
  if (FIELDS.model(model)) rec.model = model;
  if (FIELDS.effort(payload.effort)) rec.effort = payload.effort;
  Object.assign(rec, payloadUsage(payload));
  if (decision) rec.outcome = decision.deny ? 'denied' : 'allowed';
  if (FIELDS.redactions(redactions)) rec.redactions = redactions;
  if (FIELDS.masked(masked)) rec.masked = masked;
  return rec;
}
