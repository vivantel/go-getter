// `go-getter act <action> ...`: the one path to a real-world effect (decision 0180 item 5). Looks the action up in docs/effects.md, checks the
// cap for its class against the grant and its ancestors', logs the effect, and only then calls the configured tool. An unmapped action and an
// effect over a cap are refused and nothing is called.
import { execFileSync } from 'node:child_process';
import { readEffects, lookupAction, EFFECTS_FILE } from './work/effects.mjs';
import { recordEffect } from './work/effect-ops.mjs';

const defaultRun = (words) => execFileSync(words[0], words.slice(1), { stdio: 'inherit' });

// `params`: { unit, who, amount, currency, zone, contract, counterparty, toolArgs, now, remote, run }. Returns { ok, code, error?, record? }.
export async function act(root, action, params) {
  const row = lookupAction(readEffects(root), action);
  if (!row) return { ok: false, code: 'unknown-class', error: `refused: action "${action}" is not mapped in ${EFFECTS_FILE}, so its class is unknown and it is never delegated (decision 0180 item 3); a person adds the mapping` };
  if (!row.tool) return { ok: false, code: 'no-tool', error: `refused: action "${action}" maps to class ${row.class} but names no tool in ${EFFECTS_FILE}` };
  const eff = { class: row.class, amount: params.amount, currency: params.currency, zone: params.zone, contract: params.contract, counterparty: params.counterparty };
  const r = await recordEffect(root, params.unit, params.who, eff, { action, now: params.now, remote: params.remote });
  if (!r.ok) return r;
  const words = [...row.tool.split(/\s+/).filter(Boolean), ...(params.toolArgs ?? [])];
  try {
    (params.run ?? defaultRun)(words);
  } catch (e) {
    return { ok: false, code: 'tool-failed', error: `the effect was logged, then ${row.tool} failed: ${e.message.split('\n')[0]}`, record: r.record };
  }
  return { ok: true, record: r.record };
}
