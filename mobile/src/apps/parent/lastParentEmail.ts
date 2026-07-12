// Remembers the last verified parent email locally so that after signing out,
// the returning-user flow can skip the marketing Welcome screen and prefill
// the email field instead of forcing a blind re-entry. This does not skip
// OTP verification — passwordless auth still requires a fresh code — it just
// removes the friction of retyping an email and sitting through the intro.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@busbuzz/last_parent_email';

export async function saveLastParentEmail(email: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, email);
  } catch {
    // Non-fatal — worst case, the next login just starts from Welcome again.
  }
}

export async function getLastParentEmail(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export async function clearLastParentEmail(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Non-fatal
  }
}
