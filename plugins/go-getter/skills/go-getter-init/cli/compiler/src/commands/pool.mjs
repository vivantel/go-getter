// go-getter pool acquire [--branch <b> | --session <id>] [--json] | release <slot> [--force] [--backup] | status [--json]
import { fileURLToPath } from 'node:url';
import { acquire, poolStatus, release } from '../pool/slots.mjs';
import { warm, warmInBackground } from '../pool/warm.mjs';

const USAGE = 'usage: go-getter pool acquire (--branch <name> | --session <id>) [--json] | release <slot> [--force] [--backup] | status [--json] | warm [--sync]';

export default function poolCommand({ args }) {
  const [sub, ...rest] = args;
  const flag = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
  const json = rest.includes('--json');
  try {
    if (sub === 'acquire') {
      const got = acquire(process.cwd(), { branch: flag('--branch'), session: flag('--session') });
      console.log(json ? JSON.stringify(got, null, 2) : `${got.path} (${got.branch ?? `session ${got.session}`})`);
      return 0;
    }
    if (sub === 'release') {
      const target = rest.find((a) => !a.startsWith('--'));
      if (!target) throw Object.assign(new Error(USAGE), { usage: true });
      const done = release(process.cwd(), target, { force: rest.includes('--force'), backup: rest.includes('--backup') });
      console.log(json ? JSON.stringify(done, null, 2) : `released ${done.slot}${done.backup ? `; work saved in ${done.backup}` : ''}`);
      return 0;
    }
    if (sub === 'warm') {
      if (rest.includes('--sync')) {
        const done = warm(process.cwd(), { log: (m) => console.error(`pool: ${m}`) });
        console.log(`warm: created ${done.created.length}, refreshed ${done.refreshed.length}`);
      } else {
        warmInBackground(process.cwd(), fileURLToPath(new URL('../../bin/go-getter.mjs', import.meta.url)));
        console.log('warm: started in the background (log: .go-getter/pool/warm.log)');
      }
      return 0;
    }
    if (sub === 'status') {
      const s = poolStatus(process.cwd());
      const slots = s.slots.map((x) => ({ slot: x.slot, state: x.state, ...(x.reason && { reason: x.reason }), ...(x.files && { files: x.files }), ...(x.branch && { branch: x.branch }) }));
      if (json) console.log(JSON.stringify({ available: s.available, counts: s.counts, slots }, null, 2));
      else {
        console.log(`available ${s.available} of ${s.config.size} (free ${s.counts.free}, cold ${s.counts.cold}, claimed ${s.counts.claimed}, unmanaged ${s.counts.unmanaged})`);
        for (const x of slots) console.log(`${x.slot}\t${x.state}${x.branch ? `\t${x.branch}` : ''}${x.reason ? `\t${x.reason}` : ''}${x.files ? ` (${x.files.join(', ')})` : ''}`);
      }
      return 0;
    }
  } catch (err) {
    if (err.usage) {
      console.error(USAGE);
      return 2;
    }
    console.error(`pool: ${(err.stderr?.toString().trim() || err.message).split('\n')[0]}`);
    return 1;
  }
  console.error(USAGE);
  return 2;
}
