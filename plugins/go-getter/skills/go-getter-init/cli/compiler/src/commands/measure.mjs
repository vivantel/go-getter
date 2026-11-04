// go-getter measure define <file> | read <meter> --value <v> [--reader <name>] | series <meter> [--json] | due [--now <iso>] | expire [--now <iso>]
import { defineMeter, recordReading, series, due, expire } from '../measure.mjs';

const USAGE = 'usage: go-getter measure define <file> | read <meter> --value <v> [--reader <name>] | series <meter> [--json] | due [--now <iso>] | expire [--now <iso>]';

export default async function measureCommand({ args }) {
  const [sub, ...rest] = args;
  const root = process.cwd();
  const flag = (name) => (rest.includes(name) ? rest[rest.indexOf(name) + 1] : undefined);
  const positional = rest[0] && !rest[0].startsWith('--') ? rest[0] : undefined;
  const now = flag('--now') ? new Date(flag('--now')) : new Date();
  if (Number.isNaN(now.getTime())) {
    console.error('measure: --now must be an ISO time');
    return 2;
  }
  switch (sub) {
    case 'define': {
      if (!positional) break;
      const r = defineMeter(root, positional);
      if (!r.ok) {
        console.error(`measure define: ${r.problems.join('; ')}`);
        return 1;
      }
      console.log(`defined meter ${r.id} at ${r.file}`);
      return 0;
    }
    case 'read': {
      const raw = flag('--value');
      if (!positional || raw === undefined) break;
      const value = raw === 'true' ? true : raw === 'false' ? false : raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : raw;
      const r = recordReading(root, positional, { value, reader: flag('--reader'), now });
      if (!r.ok) {
        console.error(`measure read: ${r.problem}`);
        return 1;
      }
      console.log(`recorded ${r.reading.meter}=${JSON.stringify(r.reading.value)} at ${r.reading.time} in ${r.ref}${r.note ? ` (${r.note})` : ` on ${r.stored}`}`);
      return 0;
    }
    case 'series': {
      if (!positional) break;
      const s = series(root, positional);
      if (rest.includes('--json')) console.log(JSON.stringify(s, null, 2));
      else {
        const a = s.aggregate;
        console.log(`${s.meter}: ${a.count} readings${a.count ? `, ${a.first} to ${a.last}, latest ${JSON.stringify(a.latest)}` : ''}`);
        if (a.mean !== undefined) console.log(`min ${a.min}, max ${a.max}, mean ${a.mean}`);
        for (const [p, n] of Object.entries(a.periods)) console.log(`  ${p}: ${n}`);
      }
      return 0;
    }
    case 'due': {
      const d = due(root, { now });
      if (!d.length) console.log('no meter is due');
      for (const x of d) console.log(`${x.meter}: due (last ${x.last ?? 'never'})\n  unit: kind=${x.unit.kind} capabilities=${x.unit.capabilities.join(',') || '-'} accept="${x.unit.accept}"`);
      return 0;
    }
    case 'expire': {
      const removed = expire(root, { now });
      console.log(removed.length ? removed.map((r) => `expired ${r}`).join('\n') : 'no period has expired');
      return 0;
    }
    default:
  }
  console.error(USAGE);
  return 2;
}
