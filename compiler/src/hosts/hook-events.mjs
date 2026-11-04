// Hook-config editing shared by apply and the host adapters: go-getter's own entries are replaced, everything else kept.
export const RUNNER = '.go-getter/bin/go-getter';
// Recognises go-getter's hook entries in both command shapes (the old relative `sh <runner> hook` and the walk-up one that quotes the path).
const HOOK_TAG = new RegExp(`${RUNNER.replaceAll('.', '\\.')}(\\\\")? hook`);

const isOurs = (h) => HOOK_TAG.test(JSON.stringify(h));

// Replace go-getter's entry in an event list (or remove it when entry is null), keeping everything else.
export function upsert(list, entry) {
  const kept = (list ?? []).filter((x) => !isOurs(x));
  return entry ? [...kept, entry] : kept;
}

export function setEvent(obj, keys, entry) {
  const out = structuredClone(obj);
  let node = out;
  for (const k of keys.slice(0, -1)) node = node[k] ??= {};
  const last = keys[keys.length - 1];
  const next = upsert(node[last], entry);
  if (next.length) node[last] = next;
  else delete node[last];
  return out;
}
