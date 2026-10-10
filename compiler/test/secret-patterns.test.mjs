import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, findings, redactionRegexes } from '../src/secrets/patterns.mjs';

const kinds = (text) => findings(text).map((f) => f.kind);

// Fake values built from parts so this file is not itself a finding.
const fake = {
  aws: 'AKIA' + 'ABCDEFGHIJKLMNOP',
  google: 'AIza' + 'A'.repeat(35),
  github: 'ghp_' + 'a1B2'.repeat(9),
  githubPat: 'github_pat_' + 'a1B2c3'.repeat(5),
  gitlab: 'glpat-' + 'a1B2c3D4'.repeat(3),
  slack: 'xoxb-' + '1234567890-abcdef',
  npm: 'npm_' + 'a1B2'.repeat(9),
  anthropic: 'sk-ant-' + 'a1B2c3D4'.repeat(3),
  stripe: 'sk_live_' + 'a1B2c3D4'.repeat(3),
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  key: '-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu\n-----END RSA PRIVATE KEY-----',
};

test('each token format is found, with its kind', () => {
  const expected = { aws: 'aws', google: 'google', github: 'github', githubPat: 'github', gitlab: 'gitlab', slack: 'slack', npm: 'npm', anthropic: 'anthropic', stripe: 'stripe', jwt: 'jwt', key: 'private-key' };
  for (const [name, kind] of Object.entries(expected)) assert.deepEqual(kinds(`x ${fake[name]} y`), [kind], name);
});

test('a finding carries the index and length of the match, never a copy of it', () => {
  const text = `before ${fake.github} after`;
  const [f] = findings(text);
  assert.deepEqual(Object.keys(f).sort(), ['index', 'kind', 'length']);
  assert.equal(text.slice(f.index, f.index + f.length), fake.github);
});

test('labelled assignments need a name, a long mixed value and no reference syntax', () => {
  for (const hit of ['password = "hunter2hunter2hunter2"', "api_key: 'k3y9k3y9k3y9k3y9k3'", 'SECRET_TOKEN=abcdef0123456789abcdef', 'db_password: Zx81Zx81Zx81Zx81', 'AWS_SECRET_ACCESS_KEY=' + 'wJalrXUtnFEMI7K7MDENG' + 'bPxRfiCYEXAMPLEKEY']) {
    assert.deepEqual(kinds(hit), ['assignment'], hit);
  }
  for (const miss of [
    'token = abc123abc123abc',          // 15 characters
    'password = process.env.PASSWORD_NAME', // a reference: no digit
    'api_key: ${{ secrets.API_KEY }}',     // a template
    'secret = getSecret(config.secretName)', // a call
    'token = 1234567890123456',          // digits only
    'name = abcdef0123456789abcdef',     // not a labelled name
  ]) {
    assert.deepEqual(kinds(miss), [], miss);
  }
});

test('a specific token format wins over the assignment around it', () => {
  assert.deepEqual(kinds(`GITHUB_TOKEN=${fake.github}`), ['github']);
});

test('hashes, lockfile integrity strings and ordinary identifiers are not findings', () => {
  for (const text of [
    'sha512-' + 'AbCd1234'.repeat(10) + '==',
    'commit 3f786850e387550fdab836ed7e6dc881de23001b',
    'sha256:' + 'a'.repeat(64),
    'id: 123e4567-e89b-12d3-a456-426614174000',
  ]) {
    assert.deepEqual(kinds(text), [], text);
  }
});

test('findings are in order and do not overlap', () => {
  const text = `${fake.aws} then ${fake.stripe} then password = "hunter2hunter2hunter2"`;
  const list = findings(text);
  assert.deepEqual(list.map((f) => f.kind), ['aws', 'stripe', 'assignment']);
  for (let i = 1; i < list.length; i++) assert.ok(list[i].index >= list[i - 1].index + list[i - 1].length);
});

test('output redaction keeps to the specific token formats and gets fresh regular expressions each time', () => {
  const redacted = PATTERNS.filter((p) => p.redact).map((p) => p.kind);
  assert.ok(redacted.includes('private-key') && redacted.includes('github'));
  assert.ok(!redacted.includes('jwt') && !redacted.includes('assignment'));
  const a = redactionRegexes();
  const b = redactionRegexes();
  assert.notEqual(a[0], b[0]);
  assert.ok(a.every((re) => re.global));
});
