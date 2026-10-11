// Whether an outward command shape may run without asking now (decision 0130): a remembered approval of the shape, or the
// active run granting it, and in both cases the shape's preconditions hold at this use.
import { shapeApproved } from '../secrets/approvals.mjs';
import { activeRun } from './record.mjs';
import { checkShape } from './preconditions.mjs';

// { allowed: true, by: 'run' | 'remembered' }, or { allowed: false, firstUse: true } when nothing grants the shape yet, or
// { allowed: false, reason } when a grant exists but a precondition fails.
export function shapeAllowance(project, id, command, { gh, env = process.env } = {}) {
  const run = activeRun(project, { env });
  const inRun = Boolean(run?.grants.includes(id));
  if (!inRun && !shapeApproved(project, id, env)) return { allowed: false, firstUse: true };
  const check = checkShape({ project, id, command, run: inRun ? run : null, ...(gh ? { gh } : {}) });
  return check.ok ? { allowed: true, by: inRun ? 'run' : 'remembered' } : { allowed: false, reason: check.reason };
}
