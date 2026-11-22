// Stashes are shared by every worktree of a repository, so a stash made in one slot is visible from all of them. `status` lists them and
// ties one to a slot when its message names the slot's branch; nothing here drops one. Slot work uses commits, not stashes.
import { execFileSync } from 'node:child_process';
import { cleanGitEnv } from '../git-env.mjs';

export function stashes(main, slots = []) {
  let out = '';
  try {
    out = execFileSync('git', ['stash', 'list', '--format=%gd%x09%gs'], { cwd: main, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: cleanGitEnv(process.env) });
  } catch {
    return [];
  }
  return out.split('\n').filter(Boolean).map((line) => {
    const [ref, ...rest] = line.split('\t');
    const message = rest.join('\t');
    const owner = slots.find((s) => s.branch && message.includes(s.branch));
    return { ref, message, ...(owner && { slot: owner.slot }) };
  });
}
