// The functions an MCP tool may name (decision 0139 items 3 and 4). This list is in code on purpose: a pack, vendored or not,
// cannot widen it. A declaration whose function is not here is refused when the pack loads.
export const READ_ONLY_FUNCTIONS = Object.freeze([
  'plan-status',
  'plan-next',
  'refs',
  'coverage',
  'run-status',
  'run-next',
  'knowledge-list',
  'knowledge-get',
]);

// Verbs no tool may ever expose, whatever a pack declares. Not consulted to decide (the list above is the rule); it names
// the verbs for the refusal message and for the test that guards the list.
export const NEVER_EXPOSED = Object.freeze([
  'run-start',
  'run-end',
  'run-attempt',
  'approvals-add',
  'approvals-allow',
  'approvals-revoke',
  'secret',
  'apply',
  'update',
  'remove',
  'reconfigure',
  'worktree',
  'sandbox',
  'plan-issue',
  'tracker-write',
]);

// Input names that carry a path, a glob or an address: tool inputs are ids and enumerated values, never these.
export const PATH_LIKE_INPUT = /(^|[-_])(path|paths|file|files|dir|dirs|directory|glob|globs|url|uri|cwd)($|[-_])/i;

// Errors for one declaration (empty when it is acceptable).
export function checkDeclaration(tool, at) {
  const errors = [];
  if (!READ_ONLY_FUNCTIONS.includes(tool.function)) {
    errors.push(`${at}.function: "${tool.function}" is not a read-only function${NEVER_EXPOSED.includes(tool.function) ? ' (it is never exposed)' : ''}; allowed: ${READ_ONLY_FUNCTIONS.join(', ')}`);
  }
  for (const [name, param] of Object.entries(tool.input ?? {})) {
    if (PATH_LIKE_INPUT.test(name)) errors.push(`${at}.input.${name}: a path, glob or address input is refused; inputs are ids and enumerated values`);
    if (param.type === 'enum' && !param.values?.length) errors.push(`${at}.input.${name}: an enum input lists its values`);
    if (param.type === 'id' && param.values) errors.push(`${at}.input.${name}: an id input takes no values`);
    for (const v of param.values ?? []) if (PATH_LIKE_INPUT.test(v) || /[\\/]|\.\./.test(v)) errors.push(`${at}.input.${name}.values: "${v}" looks like a path`);
  }
  return errors;
}
