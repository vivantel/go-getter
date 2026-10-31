// Allow rules a person may add for commands a host's own permission layer can still refuse (decision 0152). Output only:
// nothing here writes a file. The commands come from the project's answers (`free` on a gate-command guardrail, the
// tracker's plan-issue verbs); the host's local allow file and rule syntax come from its capabilities.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { collectEnforcement } from './enforce.mjs';
import { catalogFor, gateArgs, DEFAULT_PROVIDER } from './gate.mjs';
import { writeMode, VERBS } from './trackers/write.mjs';
import { packageCapabilities } from './governance.mjs';
import { detect } from './detect.mjs';

// How go-getter is typed in this project: the checkout's entry script, the project runner, else a go-getter on PATH.
function runner(project) {
  if (existsSync(path.join(project, 'compiler/bin/go-getter.mjs'))) return 'node compiler/bin/go-getter.mjs';
  if (existsSync(path.join(project, '.go-getter/bin/go-getter'))) return '.go-getter/bin/go-getter';
  return 'go-getter';
}

// A glob that names a fixed command and nothing else: literal words and one trailing ` *` for its arguments.
const NARROW = /^[A-Za-z0-9._/-]+(?: [A-Za-z0-9._/-]+)* \*$/;

// The commands the project's answers free or send to a human, as `{ command, why }` with `command` the fixed words.
export function suggestedCommands(project) {
  const gates = collectEnforcement(project)
    .filter((e) => e.tier === 2 && e.parsed?.kind === 'builtin' && e.parsed.id === 'gate-command')
    .map((e) => gateArgs(e.parsed.args));
  const out = new Map();
  for (const g of gates) {
    for (const entry of catalogFor(g.provider ?? DEFAULT_PROVIDER)) {
      if (entry.class !== 'outward' || !g.free.includes(entry.id)) continue;
      for (const glob of entry.native ?? []) if (NARROW.test(glob)) out.set(glob.slice(0, -2), `${entry.id} runs without asking (hitl free-commands)`);
    }
  }
  const mode = writeMode(project);
  if (mode !== 'off') for (const verb of VERBS) out.set(`${runner(project)} plan issue ${verb}`, `plan issue ${verb} ${mode === 'allow' ? 'runs without asking' : 'asks a human'} (tracker writes: ${mode})`);
  return [...out].map(([command, why]) => ({ command, why }));
}

// The rule strings of `commands` in a host's allow format.
const render = (format, commands) => {
  if (format === 'claude-permissions') return commands.map((c) => `Bash(${c.command}:*)`);
  return null;
};

// Per host that has a person-owned allow layer: `{ host, file, rules, commands }`. Empty when nothing is suggested.
export function allowSuggestions(project, hosts, { caps = packageCapabilities() } = {}) {
  const targets = hosts?.length ? hosts : detect(project).hostAgents;
  const commands = suggestedCommands(project);
  if (!commands.length) return [];
  return targets.flatMap((host) => {
    const layer = caps[host]?.permissions?.userAllow;
    const rules = layer && render(layer.format, commands);
    return rules ? [{ host, file: layer.file, rules, commands }] : [];
  });
}

// The text to show for `allowSuggestions`, as lines.
export function formatSuggestions(suggestions) {
  return suggestions.flatMap((s) => [
    `${s.host}: a host permission layer may still refuse these commands (${s.commands.map((c) => c.why).join('; ')}).`,
    `  To allow them, add this to ${s.file} yourself (a gitignored file; at the prompt, type "! <command>" to run a command in the session):`,
    `  ${JSON.stringify({ permissions: { allow: s.rules } })}`,
    `  Keep it out of git: echo ${s.file} >> .git/info/exclude`,
    '  go-getter and its agents never write this file.',
  ]);
}
