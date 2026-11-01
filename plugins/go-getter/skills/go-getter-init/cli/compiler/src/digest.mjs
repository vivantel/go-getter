// The daily digest (decision 0155 item 4, procedure reviewing-the-daily-digest): what the autonomous work did since the last
// digest, in one report. Ids, numbers and short reasons only; no prompt, transcript or file content.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readArtifacts } from './artifacts.mjs';
import { DIGEST_DIR, STOPS_LOG } from './defaults.mjs';
import { readLog, summarize } from './telemetry/record.mjs';

export const LAST_FILE = path.join(DIGEST_DIR, 'last.json');
// Written by the audit picker (roadmap T8): { prs: [number], flagged: [number] }.
export const AUDIT_FILE = path.join(DIGEST_DIR, 'audit.json');

const DAY = 86_400_000;
const after = (iso, since) => typeof iso === 'string' && Date.parse(iso) > since.getTime();

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

// When the last digest was marked, else a day before `now`.
export function lastDigest(project, now = new Date()) {
  const at = readJson(path.join(project, LAST_FILE), {}).at;
  return typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? new Date(at) : new Date(now.getTime() - DAY);
}

export function markDigest(project, now = new Date()) {
  mkdirSync(path.join(project, DIGEST_DIR), { recursive: true });
  writeFileSync(path.join(project, LAST_FILE), `${JSON.stringify({ at: now.toISOString() })}\n`);
}

// Draft artifacts an unattended interview logged since `since`.
export function loggedDefaults(project, since) {
  return readArtifacts(project, ['decisions', 'facts'])
    .filter((a) => a.data.status === 'draft' && a.data['go-getter']?.defaulted && after(a.data['go-getter'].defaulted.at, since))
    .map((a) => {
      const d = a.data['go-getter'].defaulted;
      return { id: a.data.id, pack: d.pack, question: d.question, option: d.option, at: d.at };
    });
}

export function stoppedTriggers(project, since) {
  const file = path.join(project, STOPS_LOG);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
    try {
      const e = JSON.parse(line);
      return after(e.ts, since) ? [e] : [];
    } catch {
      return [];
    }
  });
}

const defaultExec = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout: 60_000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

// Merged PRs since `since`, or null without `gh`.
export function mergedSince(project, since, { exec = defaultExec } = {}) {
  try {
    const out = exec('gh', ['pr', 'list', '--state', 'merged', '--search', `merged:>=${since.toISOString().slice(0, 10)}`, '--limit', '200', '--json', 'number,title,mergedAt'], project);
    const list = JSON.parse(out);
    return Array.isArray(list) ? list.filter((p) => after(p?.mergedAt, since)).map((p) => ({ number: p.number, title: p.title, mergedAt: p.mergedAt })) : [];
  } catch {
    return null;
  }
}

export function spendSince(project, since) {
  const s = summarize(readLog(project).filter((r) => after(r.ts, since)));
  return { records: s.records, costUsd: s.cost, byModel: s.models };
}

export function auditSample(project) {
  const a = readJson(path.join(project, AUDIT_FILE), {});
  const nums = (v) => (Array.isArray(v) ? v.filter(Number.isInteger) : []);
  return { prs: nums(a.prs), flagged: nums(a.flagged) };
}

export function buildDigest(project, { now = new Date(), since = lastDigest(project, now), exec } = {}) {
  const prs = mergedSince(project, since, { exec });
  return {
    since: since.toISOString(),
    defaults: loggedDefaults(project, since),
    stops: stoppedTriggers(project, since),
    mergedPrs: prs ?? [],
    ...(prs === null ? { prsUnavailable: true } : {}),
    spend: spendSince(project, since),
    audit: auditSample(project),
  };
}
