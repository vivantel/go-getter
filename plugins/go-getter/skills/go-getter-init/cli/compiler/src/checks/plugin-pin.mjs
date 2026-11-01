// Dogfooding check (decision 0160): the plugin version this repo pins in project settings is not older than its latest release tag.
import { compareVersions, latestTag, parseVersion, pinnedRef } from '../plugin-pin.mjs';

export function pinProblem(ref, tag) {
  if (ref === null) return 'no pinned plugin ref in .claude/settings.json (run "go-getter apply")';
  if (!parseVersion(ref)) return `pinned plugin ref "${ref}" is not a release tag`;
  if (tag && compareVersions(ref, tag) < 0) return `pinned plugin ref ${ref} is older than the latest release ${tag} (run "go-getter apply")`;
  return null;
}

export default function checkPluginPin({ root }) {
  const problem = pinProblem(pinnedRef(root), latestTag(root));
  if (problem) {
    console.error(`check plugin-pin: ${problem}`);
    return 1;
  }
  console.log('check plugin-pin: ok');
  return 0;
}
