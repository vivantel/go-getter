// A synthetic pack with a profile topic, a gated question and basic and advanced questions, for interview, render and update tests.
const decision = (slug, body) => ({ decisions: [{ slug, title: `Decision ${slug}`, tags: ['configuration'], frontmatter: { track: 'process' }, body: `## Decision\n\n${body}\n` }] });

export function tieredPack() {
  return {
    id: 'tiered',
    version: '0.1.0',
    family: 'sdlc',
    title: 'Tiered fixture',
    summary: 'Profiles, tiers and a gated question.',
    questions: [
      {
        id: 'isolation',
        prompt: 'How are tasks isolated?',
        options: [
          { id: 'worktree', label: 'Worktree', tradeoff: 'Cheap.', recommended: true },
          { id: 'clone', label: 'Clone', tradeoff: 'Heavy.' },
          { id: 'tree', label: 'One tree', tradeoff: 'Unsafe.' },
        ],
      },
      {
        id: 'location',
        prompt: 'Where do worktrees live?',
        when: { question: 'isolation', in: ['worktree'] },
        options: [
          { id: 'sibling', label: 'Sibling directory', tradeoff: 'Outside the repo.', recommended: true },
          { id: 'inside', label: 'Inside the repo', tradeoff: 'Ignored by git.' },
        ],
      },
      { id: 'limit', prompt: 'How many tasks run at once?', type: 'text', default: '3', pattern: '^\\d+$' },
      { id: 'timeout', prompt: 'Task timeout in minutes?', type: 'text', default: '30', pattern: '^\\d+$', tier: 'advanced' },
      { id: 'labels', prompt: 'Labels?', type: 'list', default: ['task'], detect: 'ci.labels', tier: 'advanced' },
      {
        id: 'cap',
        prompt: 'Cap the size?',
        tier: 'advanced',
        options: [
          { id: 'on', label: 'On', tradeoff: 'Safe.', recommended: true },
          { id: 'off', label: 'Off', tradeoff: 'Drifts.' },
        ],
      },
    ],
    profiles: [
      { topic: 'task-isolation', id: 'worktrees', label: 'Worktrees', tradeoff: 'One checkout per task.', recommended: true, answers: { isolation: 'worktree', location: 'sibling', limit: '4' } },
      { topic: 'task-isolation', id: 'clones', label: 'Clones', tradeoff: 'Full copies.', answers: { isolation: 'clone', limit: '2' } },
    ],
    outputs: {
      isolation: { worktree: decision('isolation', 'Worktree.'), clone: decision('isolation', 'Clone.'), tree: decision('isolation', 'One tree.') },
      location: { sibling: decision('location', 'Sibling.'), inside: decision('location', 'Inside.') },
      limit: { '*': decision('limit', 'Limit {{answer.limit}}.') },
      timeout: { '*': decision('timeout', 'Timeout {{answer.timeout}}.') },
      labels: { '*': decision('labels', 'Labels {{answer.labels}}.') },
      cap: { on: decision('cap', 'On.'), off: decision('cap', 'Off.') },
    },
  };
}
