export type SavePickupResult = { ok: true } | { ok: false; error: string };

export async function savePickupLocation(
  accessToken: string,
  studentId: string,
  lat: number,
  lng: number,
): Promise<SavePickupResult> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return { ok: false, error: "Couldn't save — check your connection and try again." };

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/update-pickup-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ studentId, lat, lng }),
    });

    if (response.ok) return { ok: true };

    // Surface the server's specific reason (e.g. the sanity-distance check
    // in update-pickup-location) instead of always falling back to a
    // generic connection error.
    const errJson = await response.json().catch(() => null);
    return {
      ok: false,
      error:
        typeof errJson?.error === 'string'
          ? errJson.error
          : "Couldn't save — check your connection and try again.",
    };
  } catch {
    return { ok: false, error: "Couldn't save — check your connection and try again." };
  }
}
