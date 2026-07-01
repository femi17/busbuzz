/**
 * Scoped pure-logic test for ParentApp.tsx's navigation decision logic.
 * No Jest/RNTL infra installed in mobile/ (confirmed). Run directly with:
 *   node mobile/__tests__/navigation-state-machine.test.js
 * Logic mirrors init() and onAuthStateChange() in
 * mobile/src/apps/parent/ParentApp.tsx (lines 120-178). Not auto-wired to
 * `npm test` — see .pipeline/test-results.md.
 */
const assert = require('assert');

function decideInitialRoute(hasSession, onboardingCompleted) {
  if (!hasSession) return { route: 'Onboarding', screen: 'Welcome' };
  if (onboardingCompleted) return { route: 'Main' };
  return { route: 'Onboarding', screen: 'ChildConfirmation' };
}

function decideOnAuthEvent(event, onboardingCompleted) {
  if (event === 'SIGNED_IN') {
    return onboardingCompleted
      ? { route: 'Main' }
      : { route: 'Onboarding', screen: 'ChildConfirmation' };
  }
  if (event === 'SIGNED_OUT') return { route: 'Onboarding', screen: 'Welcome' };
  return null;
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

test('no session routes to Onboarding/Welcome', () =>
  assert.deepStrictEqual(decideInitialRoute(false, null), { route: 'Onboarding', screen: 'Welcome' }));
test('session + onboarding_completed=true routes to Main', () =>
  assert.deepStrictEqual(decideInitialRoute(true, true), { route: 'Main' }));
test('session + onboarding_completed=false resumes at ChildConfirmation (not Welcome)', () =>
  assert.deepStrictEqual(decideInitialRoute(true, false), { route: 'Onboarding', screen: 'ChildConfirmation' }));
test('session + onboarding_completed=null resumes at ChildConfirmation', () =>
  assert.deepStrictEqual(decideInitialRoute(true, null), { route: 'Onboarding', screen: 'ChildConfirmation' }));

test('SIGNED_IN + onboarding complete -> Main', () =>
  assert.deepStrictEqual(decideOnAuthEvent('SIGNED_IN', true), { route: 'Main' }));
test('SIGNED_IN + onboarding incomplete -> Onboarding/ChildConfirmation', () =>
  assert.deepStrictEqual(decideOnAuthEvent('SIGNED_IN', false), { route: 'Onboarding', screen: 'ChildConfirmation' }));
test('SIGNED_OUT always -> Onboarding/Welcome regardless of prior onboarding state', () => {
  assert.deepStrictEqual(decideOnAuthEvent('SIGNED_OUT', true), { route: 'Onboarding', screen: 'Welcome' });
  assert.deepStrictEqual(decideOnAuthEvent('SIGNED_OUT', false), { route: 'Onboarding', screen: 'Welcome' });
});
test('unrelated auth events trigger no navigation', () =>
  assert.strictEqual(decideOnAuthEvent('TOKEN_REFRESHED', true), null));

console.log('---');
console.log(`Passed: ${pass} Failed: ${fail}`);
process.exit(fail > 0 ? 1 : 0);
