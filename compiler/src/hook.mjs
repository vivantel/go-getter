// Shared tier-2 hook runtime: every host's pre-tool hook calls `go-getter hook pre-tool --host <id>`.
// Evaluates the project's tier-2 guardrail entries against the tool call and answers in the host's format.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { collectEnforcement } from './enforce.mjs';
import { matchesAny } from './glob.mjs';
import { FIELDS } from './telemetry/schema.mjs';
import { patternsOf } from './checks/builtin/deny-path.mjs';

const METADATA = new Set(['session_id', 'transcript_path', 'cwd', 'hook_event_name', 'permission_mode', 'model', 'model_id', 'model_params', 'conversation_id', 'generation_id', 'cursor_version', 'workspace_roots', 'user_email', 'turn_id', 'tool_use_id', 'agent_id', 'agent_type', 'prompt_id', 'scratchpad_dir', 'effort']);

// Prose fields of the tools go-getter knows, by kind: they carry text for a model or a file body, never a path to reach.
// Every other field of a known tool is still scanned, so an unexpected field only adds false positives.
const PROSE = {
  file: ['content', 'contents', 'file_text', 'old_string', 'new_string', 'oldString', 'newString', 'old_str', 'new_str', 'edits'],
  shell: ['description'],
  search: ['pattern'],
  fetch: ['prompt'],
  websearch: ['query'],
  delegate: ['prompt', 'description', 'message'],
  todo: ['todos'],
  memory: ['fact'],
};
// Tool names (lowercased) of every host the shared runtime serves, mapped to their kind. A name not listed is unknown:
// all of its input is scanned. Shell commands stay tokenised whole, so a restricted name anywhere in one is denied.
const TOOLS = {
  // file read, write and edit tools
  read: 'file', write: 'file', edit: 'file', multiedit: 'file', notebookedit: 'file', read_file: 'file', write_file: 'file',
  replace: 'file', read_many_files: 'file', view: 'file', create: 'file', str_replace_editor: 'file', delete: 'file',
  // shell tools
  bash: 'shell', shell: 'shell', run_shell_command: 'shell',
  // content search: the pattern is a regex over file bodies; the path, glob and include fields are scanned
  grep: 'search', search_file_content: 'search', grep_search: 'search',
  // web fetch and web search
  webfetch: 'fetch', web_fetch: 'fetch', websearch: 'websearch', google_web_search: 'websearch', web_search: 'websearch',
  // delegation to another agent
  agent: 'delegate', task: 'delegate', spawn_agent: 'delegate',
  todowrite: 'todo', write_todos: 'todo', save_memory: 'memory',
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

export function evaluatePreTool(project, payload) {
  for (const e of collectEnforcement(project)) {
    if (e.tier !== 2 || e.parsed?.kind !== 'builtin') continue;
    if (e.parsed.id === 'deny-path') {
      const patterns = patternsOf(e.parsed.args);
      const hit = candidatePaths(payload, project).find((p) => matchesAny(p, patterns));
      if (hit) return { deny: true, reason: `blocked by guardrail ${e.guardrail}: ${toolName(payload) ?? 'tool call'} names "${hit}", a denied path` };
    }
  }
  return { deny: false };
}

// Host-specific answer: exit 2 + stderr where that blocks; Copilot reads a JSON decision.
export function respond(host, decision) {
  if (!decision.deny) return { code: 0, stdout: '', stderr: '' };
  if (host === 'copilot') return { code: 0, stdout: JSON.stringify({ permissionDecision: 'deny', permissionDecisionReason: decision.reason }), stderr: '' };
  return { code: 2, stdout: '', stderr: decision.reason };
}

// Session start: run vendored nudge scripts (POSIX sh, plain-text output) in the project; failures are silent.
export const NUDGES = ['capture-nudge.sh', 'lint-nudge.sh'];

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
  return lines.join('\n');
}

// Telemetry record for a hook event: metadata the host's payload carries (model, effort), never tool input or output.
export function hookRecord(event, host, payload, decision) {
  const rec = { event };
  if (host) rec.host = host;
  const model = typeof payload.model === 'string' ? payload.model : payload.model?.id;
  if (FIELDS.model(model)) rec.model = model;
  if (FIELDS.effort(payload.effort)) rec.effort = payload.effort;
  if (decision) rec.outcome = decision.deny ? 'denied' : 'allowed';
  return rec;
}
