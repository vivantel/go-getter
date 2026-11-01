// A raw command that a go-getter verb covers is a tier-2 guardrail (decision 0157): the pre-tool hook denies it with the verb's name.
// A tier-3 run has nothing to check after the fact.
export default function redirectToVerb() {
  return { ok: true, message: 'enforced by the pre-tool hook' };
}
