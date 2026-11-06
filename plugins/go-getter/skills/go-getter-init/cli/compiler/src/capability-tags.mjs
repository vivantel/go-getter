// Capability vocabulary (decision 0181): `docs/skills/capabilities.md`, one `tag — meaning` line each, `[model]` after the tag for a
// model or host property the router restricts on. A unit's `Needs-capability` tags are hard requirements for a worker.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const CAPABILITY_TAGS_FILE = path.join('docs', 'skills', 'capabilities.md');
const LINE = /^([a-z][a-z0-9-]*)(\s+\[model\])?\s+—\s+\S/;

// Map tag -> { model: boolean }; empty when the file is absent (every tag is then unknown).
export function loadCapabilityTags(root) {
  const file = path.join(root, CAPABILITY_TAGS_FILE);
  const vocab = new Map();
  if (!existsSync(file)) return vocab;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = LINE.exec(line);
    if (m) vocab.set(m[1], { model: Boolean(m[2]) });
  }
  return vocab;
}

export const unknownTags = (tags, vocab) => (tags ?? []).filter((t) => !vocab.has(t));
export const unmetTags = (tags, has) => (tags ?? []).filter((t) => !has.includes(t));
// The tags of a unit that restrict the router's candidate models.
export const modelTags = (tags, vocab) => (tags ?? []).filter((t) => vocab.get(t)?.model);
