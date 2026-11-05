// Host adapter registry (plan host-adapters H2, decision 0118; internal, not a public contract). An adapter is a plain object
// of operations that take and return plain JSON data (decision 0119): no callbacks, no shared state. An operation an adapter
// cannot perform answers `{ missing: <capability> }`; the caller reports it and never guesses.
import claudeCode from './claude-code.mjs';
import { wrapperAdapter } from './wrapper.mjs';

export const OPERATIONS = ['describe', 'agent', 'hookSettings', 'projectFiles', 'respond', 'respondPostTool'];

const ADAPTERS = {
  'claude-code': claudeCode,
  codex: wrapperAdapter('codex', 'deferred'),
  kilo: wrapperAdapter('kilo'),
  opencode: wrapperAdapter('opencode'),
  cursor: wrapperAdapter('cursor', 'deferred'),
  'gemini-cli': wrapperAdapter('gemini-cli', 'deferred'),
  copilot: wrapperAdapter('copilot', 'deferred'),
};

export const hostIds = () => Object.keys(ADAPTERS);
export const isRegistered = (host) => Object.hasOwn(ADAPTERS, host);
export const deferredHosts = () => hostIds().filter((h) => ADAPTERS[h].describe().status === 'deferred');
export const getAdapter = (host) => (isRegistered(host) ? ADAPTERS[host] : null);

// Runs one operation of a host's adapter. An unregistered host or an unsupported operation answers `{ missing }`.
export function hostOp(host, op, input = {}) {
  const adapter = getAdapter(host);
  if (!adapter) return { missing: 'host' };
  if (typeof adapter[op] !== 'function') return { missing: op };
  return adapter[op](input);
}
