// go-getter artifacts index | assign [--base <ref>]: generate the INDEX.md files from frontmatter, and give each
// draft-<unit>-<slug> fact or decision its final number (decision 0167 item 4).
import { writeIndexes, assignIds, numberFloor } from '../artifact-index.mjs';

const USAGE = 'usage: go-getter artifacts index | assign [--base <ref>]';

export default function artifactsCommand({ args }) {
  const [sub, ...rest] = args;
  const root = process.cwd();
  if (sub === 'index' && !rest.length) {
    const written = writeIndexes(root);
    console.log(written.length ? `artifacts index: wrote ${written.join(', ')}` : 'artifacts index: up to date');
    return 0;
  }
  if (sub === 'assign' && (!rest.length || (rest.length === 2 && rest[0] === '--base' && !rest[1].startsWith('--')))) {
    try {
      const assigned = assignIds(root, { floor: rest.length ? numberFloor(root, rest[1]) : {} });
      for (const a of assigned) console.log(`${a.from} -> ${a.to}`);
      if (!assigned.length) console.log('artifacts assign: no draft ids');
      return 0;
    } catch (err) {
      console.error(`artifacts assign: ${(err.stderr?.toString().trim() || err.message).split('\n')[0]}`);
      return 1;
    }
  }
  console.error(USAGE);
  return 2;
}
