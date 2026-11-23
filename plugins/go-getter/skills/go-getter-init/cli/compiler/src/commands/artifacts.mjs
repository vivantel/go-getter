// go-getter artifacts index | assign [<path>… | --all] [--base <ref>]: generate the INDEX.md files from frontmatter, and give each
// draft-<unit>-<slug> fact or decision its final number (decision 0167 item 4).
import path from 'node:path';
import { writeIndexes, assignIds, numberFloor } from '../artifact-index.mjs';

const USAGE = 'usage: go-getter artifacts index | assign [<path>… | --all] [--base <ref>]';

export default function artifactsCommand({ args }) {
  const [sub, ...rest] = args;
  const root = process.cwd();
  if (sub === 'index' && !rest.length) {
    const written = writeIndexes(root);
    console.log(written.length ? `artifacts index: wrote ${written.join(', ')}` : 'artifacts index: up to date');
    return 0;
  }
  if (sub === 'assign') {
    let base = null;
    let all = false;
    const paths = [];
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '--base' && rest[i + 1] && !rest[i + 1].startsWith('--')) base = rest[++i];
      else if (rest[i] === '--all') all = true;
      else if (rest[i].startsWith('--')) { console.error(USAGE); return 2; }
      else paths.push(path.resolve(root, rest[i]));
    }
    if (all && paths.length) { console.error(USAGE); return 2; }
    try {
      const floor = base ? numberFloor(root, base) : {};
      const only = paths.length ? new Set(paths) : null;
      const preview = !all && !only;
      const assigned = assignIds(root, { floor, only, dryRun: preview });
      for (const a of assigned) console.log(`${preview ? 'would assign ' : ''}${a.from} -> ${a.to}`);
      if (!assigned.length) console.log('artifacts assign: no draft ids');
      else if (preview) console.log('artifacts assign: nothing changed; pass a path to number one draft, or --all to number every draft');
      return 0;
    } catch (err) {
      console.error(`artifacts assign: ${(err.stderr?.toString().trim() || err.message).split('\n')[0]}`);
      return 1;
    }
  }
  console.error(USAGE);
  return 2;
}
