// Records the spend of a run (decision 0144) from the host's capability row `telemetry.spendSource` {kind, format, command}.
// The row says how; READERS maps a kind to its reader, so a host whose spend arrives in a known kind and format is added by data.
import { packageCapabilities } from '../governance.mjs';
import { detect } from '../detect.mjs';
import { recordTranscriptSpend } from './transcript.mjs';
import { recordSessionSpend } from './sessions.mjs';

// kind -> { coverage, when, read }. `coverage` is stamped on the records; `when` is 'hook' (read per hook event, the payload
// names a file) or 'boundary' (read at a step boundary by settleSpend, the host keeps its own store).
export const READERS = {
  transcript: { coverage: 'lower-bound', when: 'hook', read: (project, host, source, { payload, coverage }) => recordTranscriptSpend(project, host, payload?.transcript_path, { source, coverage }) },
  sessions: { coverage: 'shared-directory', when: 'boundary', read: (project, host, source, { since, exec, coverage }) => recordSessionSpend(project, host, since, { source, coverage, ...(exec ? { exec } : {}) }) },
};

const readerOf = (source) => (source && Object.hasOwn(READERS, source.kind) ? READERS[source.kind] : null);

// Never throws: spend recording must not break the step it observes.
export function recordHostSpend(project, host, payload, caps = packageCapabilities()) {
  try {
    const source = caps[host]?.telemetry?.spendSource;
    const reader = readerOf(source);
    if (reader?.when === 'hook') return reader.read(project, host, source, { payload, coverage: reader.coverage });
  } catch {
    // fail open
  }
  return { records: 0, skipped: 0 };
}

// Settles a run's spend at a step boundary (`run next`, the report): reads the hosts that keep sessions in their own store (they
// have no hook that names a file). Recording lives here so `nextInRun` stays a read. `detect()` runs once per call.
export function settleSpend(project, run, caps = packageCapabilities(), exec) {
  try {
    for (const host of detect(project).hostAgents) {
      const source = caps[host]?.telemetry?.spendSource;
      const reader = readerOf(source);
      if (reader?.when === 'boundary') reader.read(project, host, source, { since: run.startedAt, exec, coverage: reader.coverage });
    }
  } catch {
    // fail open
  }
}
