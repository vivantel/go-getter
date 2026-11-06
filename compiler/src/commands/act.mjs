// go-getter act <action> --unit <unit> [--amount N --currency C] [--zone Z] [--contract K --counterparty P] [--as <worker>] [--remote <name>] [-- <tool args>]
// The one path to a money, physical or legal effect (decision 0180). Exit 0 done, 1 refused or failed, 2 usage, 3 parked at a cap.
import { repoRoot } from '../plan.mjs';
import { remoteOf } from '../work/ledger.mjs';
import { identity } from '../work/ops.mjs';
import { act } from '../act.mjs';

const USAGE = 'usage: go-getter act <action> --unit <unit> [--amount <n> --currency <c>] [--zone <z>] [--contract <k> --counterparty <p>] [--as <worker>] [--remote <name>] [-- <tool args>]';

export default async function actCommand({ args }) {
  const [action, ...rest] = args;
  const flags = {};
  let toolArgs = [];
  const names = ['unit', 'amount', 'currency', 'zone', 'contract', 'counterparty', 'as', 'remote'];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--') {
      toolArgs = rest.slice(i + 1);
      break;
    }
    if (!rest[i].startsWith('--') || !names.includes(rest[i].slice(2)) || rest[i + 1] === undefined) flags.bad = true;
    else flags[rest[i].slice(2)] = rest[++i];
  }
  if (!action || action.startsWith('--') || !flags.unit || flags.bad || (flags.amount !== undefined && !/^\d+(\.\d+)?$/.test(flags.amount))) {
    console.error(USAGE);
    return 2;
  }
  const root = repoRoot(process.cwd());
  try {
    const who = identity(root, { as: flags.as });
    const remote = flags.remote ? remoteOf(root, flags.remote) : undefined;
    const r = await act(root, action, { unit: flags.unit, who, amount: flags.amount === undefined ? undefined : Number(flags.amount), currency: flags.currency, zone: flags.zone, contract: flags.contract, counterparty: flags.counterparty, toolArgs, remote });
    if (!r.ok) {
      console.error(`act: ${r.error}`);
      return r.code === 'effect-cap' ? 3 : 1;
    }
    console.log(`act: ${action} (${r.record.class}) logged for ${flags.unit}`);
    return 0;
  } catch (e) {
    console.error(`act: ${(e.stderr?.toString().trim() || e.message).split('\n')[0]}`);
    return 1;
  }
}
