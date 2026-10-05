// Guardrail vendored-kms-changes-only-via-sync: vendor/kms/ must equal upstream at the pinned ref.
import { diffVendor } from '../vendor.mjs';

export default function checkVendor({ root }) {
  let problems;
  try {
    problems = diffVendor(root);
  } catch (err) {
    if (process.env.GO_GETTER_OFFLINE) {
      console.warn(`check vendor: upstream unavailable (${err.message}); skipped because GO_GETTER_OFFLINE is set`);
      return 0;
    }
    console.error(`check vendor: cannot fetch upstream: ${err.message} (set GO_GETTER_OFFLINE=1 to skip)`);
    return 1;
  }
  if (problems.length) {
    console.error('check vendor: vendor/kms/ differs from upstream; never edit it by hand (docs/skills/syncing-vendored-kms.md):');
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  console.log('check vendor: ok');
  return 0;
}
