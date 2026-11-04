// go-getter queue enqueue [--pr <n>] [--check <command>] | run [--once] [--native|--no-native] [--allow-no-ci] [--interval <s>] [--timeout <min>] | status
// The merge queue (decisions 0167 item 3 and 0175 item 3); the library is compiler/src/work/queue.mjs. `run` is a loop a worker or CI job calls.
import { repoRoot } from '../plan.mjs';
import { identity } from '../work/ops.mjs';
import { enqueueBranch, formatStatus, readQueue, runQueue } from '../work/queue.mjs';

const USAGE = 'usage: go-getter queue enqueue [--pr <n>] [--check <command>] [--as <worker>] | run [--once] [--native|--no-native] [--allow-no-ci] [--interval <s>] [--timeout <min>] [--as <worker>] [--kind human|agent|ci] | status';

export default async function queueCommand({ args }) {
  const [sub, ...rest] = args;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (['--once', '--native', '--no-native', '--allow-no-ci'].includes(a)) flags[a.slice(2)] = true;
    else if (['--pr', '--check', '--as', '--kind', '--interval', '--timeout'].includes(a) && rest[i + 1] !== undefined) flags[a.slice(2)] = rest[++i];
    else flags.bad = true;
  }
  if (!['enqueue', 'run', 'status'].includes(sub) || flags.bad || (flags.pr !== undefined && !(Number(flags.pr) > 0))) {
    console.error(USAGE);
    return 2;
  }
  const root = repoRoot(process.cwd());
  try {
    if (sub === 'status') {
      console.log(formatStatus(readQueue(root)));
      return 0;
    }
    const who = identity(root, { as: flags.as, kind: flags.kind });
    if (sub === 'enqueue') {
      const r = await enqueueBranch(root, who, { pr: flags.pr ? Number(flags.pr) : undefined, check: flags.check ?? null });
      if (!r.ok) {
        console.error(`queue: ${r.error}`);
        return 1;
      }
      console.log(`queue: #${r.pr} (${r.branch}) queued`);
      return 0;
    }
    const native = flags.native ? true : flags['no-native'] ? false : undefined;
    const r = await runQueue(root, who, {
      once: Boolean(flags.once),
      native,
      allowNoCi: Boolean(flags['allow-no-ci']),
      ci: { ...(flags.interval ? { intervalMs: Number(flags.interval) * 1000 } : {}), ...(flags.timeout ? { timeoutMs: Number(flags.timeout) * 60_000 } : {}) },
      log: (step, msg) => console.log(`queue ${step}: ${msg}`),
    });
    if (!r.ok) {
      console.error(`queue: ${r.error}`);
      return 1;
    }
    if (r.busy) {
      console.log(`queue: ${r.message}; nothing to do`);
      return 0;
    }
    console.log(`queue: ${r.merged.length} merged${r.merged.length ? ` (${r.merged.map((n) => `#${n}`).join(', ')})` : ''}, ${r.returned.length} returned`);
    for (const x of r.returned) console.log(`queue: #${x.pr} returned: ${x.reason}`);
    return r.returned.length ? 1 : 0;
  } catch (e) {
    console.error(`queue: ${(e.stderr?.toString().trim() || e.message).split('\n')[0]}`);
    return 1;
  }
}
