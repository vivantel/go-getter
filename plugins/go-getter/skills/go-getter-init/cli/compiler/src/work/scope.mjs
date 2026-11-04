// The scope of a work unit as tokens, and whether two scopes overlap (decision 0167 item 1). Pure: no I/O.
//   path or glob   `src/a.mjs`, `docs/plans/`, `src/**/*.test.mjs`
//   named resource `interface:<name>` (an owned interface), `artifact:<name>` (a shared artifact),
//                  `tag:<name>` (a decision tag declared as a shared artifact)
// Two named resources overlap when they are the same resource. Two paths overlap when one contains the other, or when a glob
// can match what the other names; two globs overlap when their fixed leading directories nest (conservative: a unit that
// might collide is queued behind the claim, never let through).

export const NAMED_KINDS = ['interface', 'artifact', 'tag'];
const WILD = /[*?[\]{}]/;

// One scope entry as a normalized token string, or null when empty.
export function scopeToken(raw) {
  let t = String(raw ?? '').trim().replace(/`/g, '');
  if (!t) return null;
  const named = /^([a-z]+):(.+)$/.exec(t);
  if (named && NAMED_KINDS.includes(named[1])) return `${named[1]}:${named[2].trim()}`;
  t = t.replace(/^\.\//, '').replace(/\/{2,}/g, '/');
  if (t.endsWith('/')) t = `${t}**`;
  return t || null;
}

// A scope as a sorted list of unique tokens.
export const scopeTokens = (list) => [...new Set((list ?? []).map(scopeToken).filter(Boolean))].sort();

const isNamed = (t) => /^(interface|artifact|tag):/.test(t);
const segments = (t) => t.split('/').filter(Boolean);
const hasWild = (t) => WILD.test(t);

function staticPrefix(glob) {
  const out = [];
  for (const s of segments(glob)) {
    if (hasWild(s)) break;
    out.push(s);
  }
  return out;
}

function globRegex(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') {
        i++;
        re += '(?:.*/)?';
      } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

const isPrefix = (a, b) => a.length <= b.length && a.every((s, i) => s === b[i]);
const ancestorsOrSelf = (segs) => segs.map((_, i) => segs.slice(0, i + 1).join('/'));

// Whether two normalized tokens overlap.
export function tokensOverlap(x, y) {
  if (isNamed(x) || isNamed(y)) return x === y;
  const wx = hasWild(x);
  const wy = hasWild(y);
  if (!wx && !wy) {
    const a = segments(x);
    const b = segments(y);
    return isPrefix(a, b) || isPrefix(b, a);
  }
  if (wx && wy) {
    const a = staticPrefix(x);
    const b = staticPrefix(y);
    return isPrefix(a, b) || isPrefix(b, a);
  }
  const [lit, glob] = wx ? [y, x] : [x, y];
  const re = globRegex(glob);
  const litSegs = segments(lit);
  if (ancestorsOrSelf(litSegs).some((p) => re.test(p))) return true;
  return isPrefix(litSegs, staticPrefix(glob)); // the literal is a directory that holds what the glob matches
}

// The first pair [tokenOfA, tokenOfB] that overlaps, or null. Both arguments are scope lists (raw or normalized).
export function overlap(a, b) {
  const xs = scopeTokens(a);
  const ys = scopeTokens(b);
  for (const x of xs) for (const y of ys) if (tokensOverlap(x, y)) return [x, y];
  return null;
}

export const scopesOverlap = (a, b) => overlap(a, b) !== null;
