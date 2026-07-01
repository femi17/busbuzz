/**
 * Scoped pure-logic test for ParentApp.tsx's navigation decision function.
 * Re-implements the decision logic from ParentApp.tsx's init() and
 * onAuthStateChange() (lines 120-178) as a pure function, since the actual
 * component requires React Navigation context to render.
 */

type NavDecision =
  | { route: 'Onboarding'; screen: 'Welcome' }
  | { route: 'Onboarding'; screen: 'ChildConfirmation' }
  | { route: 'Main' };

// Mirrors the decision logic in ParentApp.tsx init() (no session / session branch)
function decideInitialRoute(
  hasSession: boolean,
  onboardingCompleted: boolean | null,
): NavDecision {
  if (!hasSession) {
    return { route: 'Onboarding', screen: 'Welcome' };
  }
  if (onboardingCompleted) {
    return { route: 'Main' };
  }
  return { route: 'Onboarding', screen: 'ChildConfirmation' };
}

// Mirrors onAuthStateChange's SIGNED_IN / SIGNED_OUT branching
function decideOnAuthEvent(
  event: 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED',
  onboardingCompleted: boolean | null,
): NavDecision | null {
  if (event === 'SIGNED_IN') {
    return onboardingCompleted
      ? { route: 'Main' }
      : { route: 'Onboarding', screen: 'ChildConfirmation' };
  }
  if (event === 'SIGNED_OUT') {
    return { route: 'Onboarding', screen: 'Welcome' };
  }
  return null; // no navigation action for other events
}

describe('ParentApp navigation state machine — init()', () => {
  test('no session routes to Onboarding/Welcome', () => {
    expect(decideInitialRoute(false, null)).toEqual({
      route: 'Onboarding',
      screen: 'Welcome',
    });
  });

  test('session + onboarding_completed=true routes to Main', () => {
    expect(decideInitialRoute(true, true)).toEqual({ route: 'Main' });
  });

  test('session + onboarding_completed=false resumes at ChildConfirmation (not Welcome)', () => {
    expect(decideInitialRoute(true, false)).toEqual({
      route: 'Onboarding',
      screen: 'ChildConfirmation',
    });
  });

  test('session + onboarding_completed=null (e.g. column null, not just false) resumes at ChildConfirmation', () => {
    expect(decideInitialRoute(true, null)).toEqual({
      route: 'Onboarding',
      screen: 'ChildConfirmation',
    });
  });
});

describe('ParentApp navigation state machine — onAuthStateChange', () => {
  test('SIGNED_IN + onboarding complete -> Main', () => {
    expect(decideOnAuthEvent('SIGNED_IN', true)).toEqual({ route: 'Main' });
  });

  test('SIGNED_IN + onboarding incomplete -> Onboarding/ChildConfirmation', () => {
    expect(decideOnAuthEvent('SIGNED_IN', false)).toEqual({
      route: 'Onboarding',
      screen: 'ChildConfirmation',
    });
  });

  test('SIGNED_OUT always -> Onboarding/Welcome regardless of prior onboarding state', () => {
    expect(decideOnAuthEvent('SIGNED_OUT', true)).toEqual({
      route: 'Onboarding',
      screen: 'Welcome',
    });
    expect(decideOnAuthEvent('SIGNED_OUT', false)).toEqual({
      route: 'Onboarding',
      screen: 'Welcome',
    });
  });

  test('unrelated auth events (e.g. TOKEN_REFRESHED) trigger no navigation', () => {
    expect(decideOnAuthEvent('TOKEN_REFRESHED', true)).toBeNull();
  });
});
