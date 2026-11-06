// Raw tools that docs/effects.md maps to a real-world effect are denied by the pre-tool hook, which names `go-getter act` (decision 0180 item 5).
// A tier-3 run has nothing to check after the fact.
export default function denyEffectTools() {
  return { ok: true, message: 'enforced by the pre-tool hook' };
}
