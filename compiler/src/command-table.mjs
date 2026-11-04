// The one list of go-getter's verbs: the usage line, the unknown-verb refusal and the test that every module under
// commands/ is listed all read it. A verb added under compiler/src/commands/ needs a row here.
export const COMMANDS = [
  { name: 'build', usage: 'build [--host <h>]... [--copy]' },
  { name: 'check', usage: 'check [<name>]' },
  { name: 'detect', usage: 'detect [<dir>]' },
  { name: 'doctor', usage: 'doctor [--project <dir>] [--hosts <h1,h2>|all]' },
  { name: 'packs', usage: 'packs' },
  { name: 'pack', usage: 'pack <pack-id>' },
  { name: 'render-pack', usage: 'render-pack <pack-id> [--answers <file>] [--project <dir>] [--dry-run]' },
  { name: 'interview', usage: 'interview next|validate <pack-id> [--answers <file>]' },
  { name: 'reconfigure', usage: 'reconfigure <pack-id> (--answers <file> | --current)' },
  { name: 'apply', usage: 'apply [--hosts <h1,h2>|all] [--check] [--force] | apply --remove [--dry-run]' },
  { name: 'update', usage: 'update [--yes] [--dry-run] [--force]' },
  { name: 'coverage', usage: 'coverage [--json]' },
  { name: 'plan', usage: 'plan status|next|start|done|issue|draft|approve' },
  { name: 'run', usage: 'run start|status|next|attempt|end' },
  { name: 'work', usage: 'work claim|heartbeat|release <unit>' },
  { name: 'worktree', usage: 'worktree new|list|clean' },
  { name: 'checkpoint', usage: 'checkpoint create|list|restore|prune' },
  { name: 'artifacts', usage: 'artifacts index | assign [--base <ref>]' },
  { name: 'refs', usage: 'refs [--staged | --base <ref>] [--json]' },
  { name: 'pr', usage: 'pr [--title <t>] [--why <intent>] [--dry-run]' },
  { name: 'outcome', usage: 'outcome check [id]' },
  { name: 'operation', usage: 'operation check|status [id]' },
  { name: 'ship', usage: 'ship [--title <t>] [--why <intent>] [--dry-run]' },
  { name: 'release', usage: 'release --batch [--dry-run]' },
  { name: 'ci', usage: 'ci status [--wait]' },
  { name: 'watch', usage: 'watch [--until done] -- <command>' },
  { name: 'verify', usage: 'verify --class <explore|plan|implement|review|debug>' },
  { name: 'secret', usage: 'secret run|put' },
  { name: 'approvals', usage: 'approvals list|add|allow|release|revoke' },
  { name: 'sandbox', usage: 'sandbox [--host <h>]' },
  { name: 'route', usage: 'route --class <task-class>' },
  { name: 'routing', usage: 'routing calibrate' },
  { name: 'measure', usage: 'measure define|read <meter>|series <meter>|due|expire' },
  { name: 'metrics', usage: 'metrics day' },
  { name: 'digest', usage: 'digest [--since <iso>] [--mark]' },
  { name: 'audit', usage: 'audit pick | audit fail <pr> --as check|guardrail|instruction' },
  { name: 'telemetry', usage: 'telemetry summary' },
  { name: 'mcp', usage: 'mcp serve' },
  { name: 'eval', usage: 'eval' },
  { name: 'hook', usage: 'hook <host> <event>', internal: true },
];

// Verbs a person types, in order; internal ones are called by generated host files.
export const PUBLIC_COMMANDS = COMMANDS.filter((c) => !c.internal);

export const usageLine = () => `usage: go-getter <${PUBLIC_COMMANDS.map((c) => c.name).join('|')}> [args]`;
export const isCommand = (name) => COMMANDS.some((c) => c.name === name);
