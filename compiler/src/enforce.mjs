// Collects go-getter.enforcement entries from a project's guardrails and runs tier-3 checks (decision 0009).
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readArtifacts } from './artifacts.mjs';
import { parseRun } from './packs.mjs';
import { cleanGitEnv } from './git-env.mjs';

const BUILTIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'checks', 'builtin');

export function collectEnforcement(project) {
  return readArtifacts(project, ['guardrails'])
    .filter((g) => g.data.status === 'active')
    .flatMap((g) =>
      (g.data['go-getter']?.enforcement ?? []).map((e) => ({
        guardrail: g.id,
        title: g.data.title,
        tier: e.tier,
        check: e.check,
        run: e.run,
        parsed: e.run ? parseRun(e.run) : null,
      })),
    );
}

export async function runBuiltin(project, parsed) {
  const file = path.join(BUILTIN_DIR, `${parsed.id}.mjs`);
  if (!existsSync(file)) return { ok: false, message: `unknown builtin check "${parsed.id}"` };
  const mod = await import(file);
  return mod.default({ project, args: parsed.args });
}

export async function runTier3(project, { onlyGuardrail } = {}) {
  const results = [];
  for (const e of collectEnforcement(project)) {
    if (e.tier !== 3 || !e.parsed) continue;
    if (onlyGuardrail && e.guardrail !== onlyGuardrail) continue;
    let result;
    if (e.parsed.kind === 'builtin') result = await runBuiltin(project, e.parsed);
    else {
      try {
        // Under a git hook GIT_DIR pins every git command to the hooked repository; a check that runs `git init` (the telemetry tests) would re-initialise it as bare.
        execSync(e.parsed.command, { cwd: project, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', env: cleanGitEnv(process.env) });
        result = { ok: true };
      } catch (err) {
        result = { ok: false, message: `${e.parsed.command} exited ${err.status}: ${(err.stderr || err.stdout || '').trim().split('\n').slice(-3).join(' | ')}` };
      }
    }
    results.push({ ...e, ...result });
  }
  return results;
}
