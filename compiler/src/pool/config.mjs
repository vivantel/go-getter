// Pool settings: the orchestration pack's answers (`pool-*` keys of the active orchestration decisions, written by `apply` from WP9 on),
// else the shipped defaults. Tests force settings with GO_GETTER_POOL_CONFIG (JSON), honoured only with GO_GETTER_TEST_MODE=1.
import { readArtifacts } from '../artifacts.mjs';

export const BRANCH_PATTERN = '^(feat|fix|docs|chore|ci|test|refactor|perf|build|style|revert)/[a-z0-9][a-z0-9._-]*$';

const num = (v, d) => (v == null || v === '' || !Number.isFinite(Number(v)) ? d : Number(v));
const list = (v) => (Array.isArray(v) ? v : String(v ?? '').split(',').map((x) => x.trim()).filter((x) => x && x !== 'none'));
const unset = (v) => (v == null || v === 'none' || v === 'default' ? null : v);

export function poolConfig(main, env = process.env) {
  const data = Object.assign(
    {},
    ...readArtifacts(main, ['decisions'])
      .filter((d) => d.data.status === 'active' && String(d.data['go-getter']?.['generated-by'] ?? '').startsWith('orchestration@'))
      .map((d) => d.data['go-getter']),
  );
  let forced = {};
  if (env.GO_GETTER_TEST_MODE === '1' && env.GO_GETTER_POOL_CONFIG) forced = JSON.parse(env.GO_GETTER_POOL_CONFIG);
  const pick = (key, answer) => forced[key] ?? data[answer];
  return {
    enabled: data.isolation === 'worktree-pool' || forced.size != null,
    size: num(pick('size', 'pool-size'), num(data['max-concurrent'], 10)),
    warm: num(pick('warm', 'pool-warm'), 2),
    warmCommand: unset(pick('warmCommand', 'pool-warm-command')) ?? '',
    base: unset(pick('base', 'pool-base')),
    claimGraceSeconds: num(pick('claimGraceSeconds', 'pool-claim-grace'), 600),
    pushedFreeSeconds: num(pick('pushedFreeSeconds', 'pool-pushed-free-delay'), 86400),
    sessionTtlSeconds: num(pick('sessionTtlSeconds', 'pool-session-ttl'), 43200),
    scratch: list(pick('scratch', 'pool-scratch')),
    branchPattern: pick('branchPattern', 'pool-branch-pattern') ?? BRANCH_PATTERN,
    only: ['on', 'true'].includes(String(pick('only', 'pool-only'))),
  };
}
