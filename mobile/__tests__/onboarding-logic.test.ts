/**
 * Scoped pure-logic tests for onboarding flow.
 * These re-implement the exact logic extracted from CodeVerificationScreen.tsx
 * since the component itself requires React Native rendering (no RNTL installed).
 * Run with: npx jest --config jest.scoped.config.js (see .pipeline notes)
 */

const CODE_LENGTH = 6;
const RESEND_COOLDOWN_SECONDS = 30;

// Mirrors handleDigitChange's filtering logic from CodeVerificationScreen.tsx:89-110
function filterDigitInput(text: string): string {
  return text.replace(/[^0-9]/g, '');
}

function isCodeComplete(digits: string[]): boolean {
  const joined = digits.join('');
  return joined.length === CODE_LENGTH && !digits.includes('');
}

// Mirrors the cooldown countdown reducer from CodeVerificationScreen.tsx:30-36
function tickCooldown(prev: number): number {
  return Math.max(0, prev - 1);
}

describe('CodeVerificationScreen digit input filtering', () => {
  test('accepts a single numeric digit', () => {
    expect(filterDigitInput('5')).toBe('5');
  });

  test('rejects alphabetic characters', () => {
    expect(filterDigitInput('a')).toBe('');
  });

  test('rejects symbols', () => {
    expect(filterDigitInput('!')).toBe('');
  });

  test('strips non-numeric chars from mixed input, keeping digits', () => {
    expect(filterDigitInput('a1b')).toBe('1');
  });

  test('empty input stays empty', () => {
    expect(filterDigitInput('')).toBe('');
  });

  test('handles multi-character paste by keeping only digits', () => {
    expect(filterDigitInput('12a3')).toBe('123');
  });
});

describe('CodeVerificationScreen auto-submit completeness check', () => {
  test('6 filled digits is complete', () => {
    expect(isCodeComplete(['1', '2', '3', '4', '5', '6'])).toBe(true);
  });

  test('5 filled + 1 empty is not complete', () => {
    expect(isCodeComplete(['1', '2', '3', '4', '5', ''])).toBe(false);
  });

  test('all empty is not complete', () => {
    expect(isCodeComplete(['', '', '', '', '', ''])).toBe(false);
  });

  test('exactly 6 chars but one slot empty string is not complete', () => {
    // Edge case: ensure we check includes('') not just joined length,
    // since join of ['','123456'] could coincidentally hit length 6 in degenerate cases
    expect(isCodeComplete(['', '1', '2', '3', '4', '5'])).toBe(false);
  });
});

describe('CodeVerificationScreen resend cooldown timer math', () => {
  test('starts at 30 seconds', () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(30);
  });

  test('ticks down by 1 each call', () => {
    let cooldown = 30;
    cooldown = tickCooldown(cooldown);
    expect(cooldown).toBe(29);
  });

  test('does not go below 0', () => {
    expect(tickCooldown(0)).toBe(0);
  });

  test('reaches 0 after 30 ticks', () => {
    let cooldown = RESEND_COOLDOWN_SECONDS;
    for (let i = 0; i < 30; i++) {
      cooldown = tickCooldown(cooldown);
    }
    expect(cooldown).toBe(0);
  });

  test('resend button should be enabled (cooldown <= 0) only after full 30s', () => {
    let cooldown = RESEND_COOLDOWN_SECONDS;
    for (let i = 0; i < 29; i++) {
      cooldown = tickCooldown(cooldown);
      expect(cooldown > 0).toBe(true); // still disabled
    }
    cooldown = tickCooldown(cooldown);
    expect(cooldown).toBe(0); // now enabled
  });
});
