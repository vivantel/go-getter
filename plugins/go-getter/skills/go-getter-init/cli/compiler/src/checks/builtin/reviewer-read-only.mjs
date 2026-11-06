// Derived from "the reviewer reports findings and changes nothing": every generated reviewer agent file on a host that has a tool list
// or a permission block restricts the role to reads. Hosts without either (codex, cursor's `readonly`) are judged by their own flag.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const AGENT_DIRS = ['.claude/agents', '.kilo/agents', '.opencode/agents', '.gemini/agents', '.github/agents', '.cursor/agents'];
const READ_TOOLS = new Set(['read', 'grep', 'glob', 'search', 'read_file', 'list_directory', 'grep_search', 'ls']);

const frontmatter = (text) => /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? '';

function problem(text) {
  const head = frontmatter(text);
  const tools = /^tools:[ \t]*(.+)$/m.exec(head)?.[1];
  if (tools) {
    const names = tools.replace(/[[\]"']/g, '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const extra = names.filter((t) => !READ_TOOLS.has(t));
    return extra.length ? `tools include ${extra.join(', ')}` : null;
  }
  if (/^permission:\s*$/m.test(head)) return /^\s+edit:\s*deny\s*$/m.test(head) && /^\s+bash:\s*deny\s*$/m.test(head) ? null : 'permission does not deny edit and bash';
  if (/^readonly:\s*true\s*$/m.test(head)) return null;
  return 'no tool list, permission or readonly flag';
}

export default function reviewerReadOnly({ project, args }) {
  const role = args.role ?? 'reviewer';
  const bad = [];
  let seen = 0;
  for (const dir of AGENT_DIRS) {
    const abs = path.join(project, dir);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs).filter((n) => n === `${role}.md`)) {
      seen++;
      const why = problem(readFileSync(path.join(abs, f), 'utf8'));
      if (why) bad.push(`${dir}/${f}: ${why}`);
    }
  }
  return bad.length ? { ok: false, message: `the ${role} may change files: ${bad.join('; ')}` } : { ok: true, message: seen ? `${seen} ${role} file(s) read-only` : `no ${role} agent file` };
}
