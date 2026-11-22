// go-getter pool acquire [--branch <b> | --session <id>] [--json] | release <slot> [--force] [--backup] | status [--json]
import { fileURLToPath } from 'node:url';
import { acquire, poolStatus, release } from '../pool/slots.mjs';
import { reap, reapInBackground } from '../pool/reap.mjs';
import { endSession, name } from '../pool/session.mjs';
import { adopt, outside, remove } from '../pool/adopt.mjs';
import { doctor } from '../pool/doctor.mjs';
import { stashes } from '../pool/stash.mjs';
import { warm, warmInBackground } from '../pool/warm.mjs';

const USAGE = 'usage: go-getter pool acquire (--branch <name> | --session <id>) [--json] | release <slot> [--force] [--backup] | status [--json] | warm [--sync] | reap [--sync] [--dry-run] [--json] | session <id> | name <branch> [--slot <pool-NN>] | end-session <id> [--backup] | adopt <path|slot> [--branch <name>] | remove <path> [--force] [--backup] | doctor [--dry-run]';

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
    if (sub === 'session') {
      if (!rest[0]) throw Object.assign(new Error(USAGE), { usage: true });
      const got = acquire(process.cwd(), { session: rest[0] });
      console.log(json ? JSON.stringify(got, null, 2) : `${got.path} (session ${got.session})`);
      return 0;
    }
    if (sub === 'name') {
      if (!rest[0] || rest[0].startsWith('--')) throw Object.assign(new Error(USAGE), { usage: true });
      const got = name(process.cwd(), rest[0], { slot: flag('--slot') });
      console.log(json ? JSON.stringify(got, null, 2) : `${got.path} (${got.branch})`);
      return 0;
    }
    if (sub === 'end-session') {
      if (!rest[0] || rest[0].startsWith('--')) throw Object.assign(new Error(USAGE), { usage: true });
      const got = endSession(process.cwd(), rest[0], { backup: rest.includes('--backup') });
      console.log(json ? JSON.stringify(got, null, 2) : `${got.action}${got.slot ? ` ${got.slot}` : ''}: ${got.reason ?? `work saved in ${got.backup}`}`);
      return 0;
    }
    if (sub === 'adopt' || sub === 'remove') {
      const target = rest.find((a, i) => !a.startsWith('--') && rest[i - 1] !== '--branch');
      if (!target) throw Object.assign(new Error(USAGE), { usage: true });
      const done = sub === 'adopt' ? adopt(process.cwd(), target, { branch: flag('--branch') }) : remove(process.cwd(), target, { force: rest.includes('--force'), backup: rest.includes('--backup') });
      console.log(json ? JSON.stringify(done, null, 2) : sub === 'adopt' ? `${done.action} ${done.slot ?? done.path}${done.branch ? ` (${done.branch})` : ''}` : `removed ${done.path}${done.backup ? `; work saved in ${done.backup}` : ''}`);
      return 0;
    }
    if (sub === 'doctor') {
      const found = doctor(process.cwd(), { dryRun: rest.includes('--dry-run') });
      if (json) console.log(JSON.stringify(found, null, 2));
      else if (!found.length) console.log('nothing to do');
      else for (const f of found) console.log(`${rest.includes('--dry-run') ? 'would ' : ''}${f.action}\t${f.slot ?? f.path ?? ''}\t${f.reason}${f.bytes != null ? ` (${f.bytes} bytes)` : ''}${f.to ? `; moved to ${f.to}` : ''}`);
      return 0;
    }
    if (sub === 'reap') {
      const cli = fileURLToPath(new URL('../../bin/go-getter.mjs', import.meta.url));
      if (!rest.includes('--sync') && !rest.includes('--dry-run')) {
        reapInBackground(process.cwd(), cli);
        console.log('reap: started in the background (log: .go-getter/pool/reap.log)');
        return 0;
      }
      const results = reap(process.cwd(), { dryRun: rest.includes('--dry-run'), log: (m) => console.error(`pool: ${m}`) });
      if (json) console.log(JSON.stringify(results, null, 2));
      else {
        for (const r of results) console.log(`${r.action}\t${r.slot}\t${r.keep ? `${r.keep}: ` : ''}${r.reason}${r.backup ? `; saved ${r.saved.files} files, ${r.saved.commits} commits in ${r.backup}` : ''}`);
        if (!results.length) console.log('no claimed slots');
      }
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
      const slots = s.slots.map((x) => ({ slot: x.slot, state: x.state, ...(x.reason && { reason: x.reason }), ...(x.files && { files: x.files }), ...(x.owner && { owner: x.owner }), ...(x.orphaned && { orphaned: x.orphaned }), ...(x.branch && { branch: x.branch }) }));
      const out = outside(process.cwd());
      const stash = stashes(s.main, slots);
      if (json) console.log(JSON.stringify({ available: s.available, counts: s.counts, slots, outside: out, stashes: stash }, null, 2));
      else {
        console.log(`available ${s.available} of ${s.config.size} (free ${s.counts.free}, cold ${s.counts.cold}, claimed ${s.counts.claimed}, unmanaged ${s.counts.unmanaged})`);
        for (const x of slots) console.log(`${x.slot}\t${x.state}${x.branch ? `\t${x.branch}` : ''}${x.reason ? `\t${x.reason}` : ''}${x.files ? ` (${x.files.join(', ')})` : ''}${x.owner ? `\towner ${x.owner.state} ${Math.round(x.owner.ageSeconds / 60)}m${x.owner.note ? ` (${x.owner.note})` : ''}` : ''}${x.orphaned ? `\torphaned: ${x.orphaned}` : ''}`);
        for (const o of out) console.log(`outside\t${o.path}\t${o.branch ?? 'detached'}${o.missing ? '\tmissing' : `\t${o.dirty} changed${o.merged ? '\tmerged' : ''}`}`);
        for (const t of stash) console.log(`stash\t${t.ref}\t${t.message}${t.slot ? `\t${t.slot}` : ''}`);
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
