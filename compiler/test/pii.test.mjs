import { test } from 'node:test';
import assert from 'node:assert/strict';
import { piiFindings, luhn, isIban, DEFAULT_CLASSES, ALL_CLASSES } from '../src/secrets/pii.mjs';

const found = (text, classes) => piiFindings(text, classes ? { classes } : undefined).map((f) => [f.kind, text.slice(f.index, f.index + f.length)]);

test('emails are found, including plus tags and subdomains', () => {
  assert.deepEqual(found('mail alice@example.com and a.b+tag@sub.example.co.uk now'), [['email', 'alice@example.com'], ['email', 'a.b+tag@sub.example.co.uk']]);
});

test('git remotes, bare hosts, scoped packages and versions are not emails', () => {
  for (const text of ['git@github.com:org/repo.git', 'ssh://git@github.com/org/repo', 'user@host', 'import "@scope/pkg"', 'pin foo@2.0.1', 'x@y.c', 'a@b..com']) {
    assert.deepEqual(found(text), [], text);
  }
});

test('card numbers need an issuer prefix, a length and a valid Luhn checksum', () => {
  for (const card of ['4111111111111111', '5555555555554444', '378282246310005', '6011111111111117', '4111 1111 1111 1111', '4111-1111-1111-1111']) {
    assert.deepEqual(found(`pay ${card} today`), [['card', card]], card);
  }
  assert.equal(luhn('4111111111111111'), true);
  assert.equal(luhn('4111111111111112'), false);
});

test('numbers that are not cards are left alone', () => {
  for (const text of [
    '4111111111111112',            // wrong checksum
    '1696118400000',               // an epoch in milliseconds
    '1696118400',                  // an epoch in seconds
    '3000', 'port 8080', 'v1.2.3-4',
    '123e4567-e89b-12d3-a456-426614174000', // a UUID
    '0000000000000000',            // Luhn-valid, no issuer
    '9999999999999995',            // no issuer
  ]) {
    assert.deepEqual(found(text), [], text);
  }
});

test('IBANs need the country length and a valid mod-97 checksum, with or without spaces', () => {
  for (const iban of ['GB82WEST12345698765432', 'DE89370400440532013000', 'FR1420041010050500013M02606', 'NL91ABNA0417164300', 'GB82 WEST 1234 5698 7654 32']) {
    assert.deepEqual(found(`to ${iban}.`), [['iban', iban]], iban);
  }
  assert.equal(isIban('GB82WEST12345698765432'), true);
  assert.equal(isIban('GB83WEST12345698765432'), false);
  for (const text of ['GB83WEST12345698765432', 'DE8937040044053201300', 'XX82WEST12345698765432', 'AB12CDEFGH']) assert.deepEqual(found(text), [], text);
});

test('an IBAN followed by words keeps only the valid part', () => {
  assert.deepEqual(found('DE89 3704 0044 0532 0130 00 and more'), [['iban', 'DE89 3704 0044 0532 0130 00']]);
});

test('phone numbers and national ids are found only when their class is listed', () => {
  const text = 'call +44 20 7946 0958 or +1 (415) 555-2671, ssn 123-45-6789';
  assert.deepEqual(found(text), []);
  assert.deepEqual(found(text, ['phone']), [['phone', '+44 20 7946 0958'], ['phone', '+1 (415) 555-2671']]);
  assert.deepEqual(found(text, ['national-id']), [['national-id', '123-45-6789']]);
  assert.equal(found(text, ALL_CLASSES).length, 3);
});

test('invalid national ids, dates and short numbers are not matched', () => {
  for (const text of ['000-12-3456', '666-12-3456', '923-12-3456', '123-00-6789', '123-45-0000', '2026-10-10', '+12345', 'a+12345678901']) {
    assert.deepEqual(found(text, ALL_CLASSES), [], text);
  }
});

test('findings are ordered, do not overlap and a card is not also a phone number', () => {
  const text = 'bob@example.com paid 4111111111111111 from GB82WEST12345698765432';
  const list = piiFindings(text);
  assert.deepEqual(list.map((f) => f.kind), ['email', 'card', 'iban']);
  for (let i = 1; i < list.length; i++) assert.ok(list[i].index >= list[i - 1].index + list[i - 1].length);
  assert.deepEqual(found('+4111111111111111', ALL_CLASSES).map((f) => f[0]), ['card'], 'sixteen digits are too many for a phone number');
  assert.deepEqual(DEFAULT_CLASSES, ['email', 'card', 'iban']);
});

test('a finding is an index and a length, never a copy', () => {
  const [f] = piiFindings('x alice@example.com y');
  assert.deepEqual(Object.keys(f).sort(), ['index', 'kind', 'length']);
});
