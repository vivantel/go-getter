// The pool's session hooks (guardrail release-the-slot-when-work-is-done): session start gives an unnamed slot (when `pool-only` is set) and
// starts a reap and a warm top-up detached; session end frees the session's finished slot and says what it did. Neither blocks, neither throws.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { poolConfig } from './config.mjs';
import { reapInBackground } from './reap.mjs';
import { endSession, slotOf } from './session.mjs';
import { acquire } from './slots.mjs';
import { mainCheckout, poolStatus } from './state.mjs';
import { warmInBackground } from './warm.mjs';

const cliPath = () => fileURLToPath(new URL('../../bin/go-getter.mjs', import.meta.url));
const background = (env = process.env) => !(env.GO_GETTER_TEST_MODE === '1' && env.GO_GETTER_POOL_NO_BG === '1');

// Text for the session's context, or ''. `cwd` is where the session started.
export function poolSessionStart(cwd, payload = {}, env = process.env) {
  let main;
  let config;
  try {
    main = mainCheckout(cwd);
    config = poolConfig(main, env);
  } catch {
    return '';
  }
  if (!config.enabled) return '';
  const lines = [];
  const session = payload.session_id ?? payload.sessionId ?? payload.conversation_id;
  if (config.only && session && !slotOf(cwd)) {
    try {
      const held = poolStatus(main).slots.find((s) => s.state === 'claimed' && s.lease?.session === session);
      const got = held ? { path: held.dir, slot: held.slot } : acquire(main, { session });
      lines.push(`go-getter pool: this checkout is read-only for work; your slot is ${got.path}. Edit and run commands there (cd ${got.path}); name its branch with \`go-getter pool name <type/slug>\`.`);
    } catch (err) {
      lines.push(`go-getter pool: no slot for this session (${String(err.message).split('\n')[0]}); run \`go-getter pool status\`.`);
    }
  }
  if (background(env)) {
    for (const start of [reapInBackground, warmInBackground]) {
      try { start(main, cliPath()); } catch { /* best effort */ }
    }
  }
  return lines.join('\n');
}

// What the session end did, for the host's log: { action, slot?, line }, or null when the pool is off or the session held nothing.
export function poolSessionEnd(cwd, payload = {}, env = process.env) {
  let main;
  try {
    main = mainCheckout(cwd);
    if (!poolConfig(main, env).enabled) return null;
  } catch {
    return null;
  }
  const session = payload.session_id ?? payload.sessionId ?? payload.conversation_id;
  if (!session) return null;
  const r = endSession(main, session);
  if (r.action === 'none') return null;
  const line = r.action === 'freed' ? `go-getter pool: ${r.slot} was finished and is released` : `go-getter pool: ${r.slot} kept (${r.reason}); it shows as orphaned in \`go-getter pool status\``;
  return { ...r, line };
}
