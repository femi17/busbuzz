/**
 * Scoped pure-logic tests for onboarding flow (CodeVerificationScreen.tsx).
 * No Jest/RNTL infra installed in mobile/ (confirmed). Run directly with:
 *   node mobile/__tests__/onboarding-logic.test.js
 * Logic mirrors handleDigitChange / isCodeComplete / resend cooldown tick
 * from mobile/src/apps/parent/onboarding/CodeVerificationScreen.tsx
 * (lines 30-36, 89-110). Not auto-wired to `npm test` — see .pipeline/test-results.md.
 */
const assert = require('assert');

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

function filterDigitInput(text) {
  return text.replace(/[^0-9]/g, '');
}

function isCodeComplete(digits) {
  const joined = digits.join('');
  return joined.length === CODE_LENGTH && !digits.includes('');
}

function tickCooldown(prev) {
  return Math.max(0, prev - 1);
}

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('PASS', name);
  } catch (e) {
    fail++;
    console.log('FAIL', name, e.message);
  }
}

test('accepts a single numeric digit', () => assert.strictEqual(filterDigitInput('5'), '5'));
test('rejects alphabetic characters', () => assert.strictEqual(filterDigitInput('a'), ''));
test('rejects symbols', () => assert.strictEqual(filterDigitInput('!'), ''));
test('strips non-numeric chars from mixed input', () => assert.strictEqual(filterDigitInput('a1b'), '1'));
test('empty input stays empty', () => assert.strictEqual(filterDigitInput(''), ''));
test('multi-character paste keeps only digits', () => assert.strictEqual(filterDigitInput('12a3'), '123'));

test('6 filled digits is complete', () => assert.strictEqual(isCodeComplete(['1', '2', '3', '4', '5', '6']), true));
test('5 filled + 1 empty is not complete', () => assert.strictEqual(isCodeComplete(['1', '2', '3', '4', '5', '']), false));
test('all empty is not complete', () => assert.strictEqual(isCodeComplete(['', '', '', '', '', '']), false));
test('empty slot mid-array is not complete', () => assert.strictEqual(isCodeComplete(['', '1', '2', '3', '4', '5']), false));

test('cooldown constant starts at 30', () => assert.strictEqual(RESEND_COOLDOWN_SECONDS, 30));
test('ticks down by 1 each call', () => assert.strictEqual(tickCooldown(30), 29));
test('does not go below 0', () => assert.strictEqual(tickCooldown(0), 0));
test('reaches 0 after 30 ticks', () => {
  let cooldown = RESEND_COOLDOWN_SECONDS;
  for (let i = 0; i < 30; i++) cooldown = tickCooldown(cooldown);
  assert.strictEqual(cooldown, 0);
});
test('resend stays disabled until the 30th tick', () => {
  let cooldown = RESEND_COOLDOWN_SECONDS;
  for (let i = 0; i < 29; i++) {
    cooldown = tickCooldown(cooldown);
    assert.ok(cooldown > 0, `expected >0 at tick ${i}, got ${cooldown}`);
  }
  cooldown = tickCooldown(cooldown);
  assert.strictEqual(cooldown, 0);
});

console.log('---');
console.log(`Passed: ${pass} Failed: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
