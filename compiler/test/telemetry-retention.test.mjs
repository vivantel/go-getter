import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { record, readLog, telemetryConfig } from '../src/telemetry/record.mjs';

const DAY = 86400000;
const NOW = new Date('2026-11-05T12:00:00Z');

function decision(id, status, data) {
  const kv = Object.entries(data).map(([k, v]) => `  ${k}: "${v}"`).join('\n');
  return `---\nid: ${id}\ntitle: ${id}\nstatus: ${status}\ndate: 2026-11-05\ntags: [observability]\ntrack: process\ngo-getter:\n${kv}\n---\n\n## Decision\n\nx\n\n## Why\n\nx\n`;
}

function project(decisions) {
  const dir = mkdtempSync(path.join(tmpdir(), 'gg-retention-'));
  mkdirSync(path.join(dir, 'docs/decisions'), { recursive: true });
  for (const [id, status, data] of decisions) writeFileSync(path.join(dir, 'docs/decisions', `${id}.md`), decision(id, status, data));
  return dir;
}

function seed(dir, ageDays) {
  mkdirSync(path.join(dir, '.go-getter/state'), { recursive: true });
  const ts = new Date(NOW.getTime() - ageDays * DAY).toISOString();
  writeFileSync(path.join(dir, '.go-getter/state/telemetry.jsonl'), `${JSON.stringify({ ts, kind: 'old' })}\n`);
}

const REC = { host: 'claude-code', event: 'pre-tool', outcome: 'allowed' };

test('an old record survives a write once an active decision sets 365 days', () => {
  const dir = project([
    ['0051-rec', 'active', { 'telemetry-recording': 'metadata-log' }],
    ['0052-telemetry-retention', 'superseded', { 'telemetry-retention-days': '30' }],
    ['0201-the-metadata-log-keeps-365-days', 'active', { 'telemetry-retention-days': '365' }],
  ]);
  try {
    assert.equal(telemetryConfig(dir).retentionDays, 365);
    seed(dir, 31);
    record(dir, REC, { now: NOW });
    assert.equal(readLog(dir).length, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the same 31-day-old record is pruned under the 30-day decision', () => {
  const dir = project([
    ['0051-rec', 'active', { 'telemetry-recording': 'metadata-log' }],
    ['0052-telemetry-retention', 'active', { 'telemetry-retention-days': '30' }],
  ]);
  try {
    seed(dir, 31);
    record(dir, REC, { now: NOW });
    assert.equal(readLog(dir).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a record older than 365 days is still pruned', () => {
  const dir = project([
    ['0051-rec', 'active', { 'telemetry-recording': 'metadata-log' }],
    ['0201-the-metadata-log-keeps-365-days', 'active', { 'telemetry-retention-days': '365' }],
  ]);
  try {
    seed(dir, 366);
    record(dir, REC, { now: NOW });
    assert.equal(readLog(dir).length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
