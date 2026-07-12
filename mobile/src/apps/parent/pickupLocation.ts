export async function savePickupLocation(
  accessToken: string,
  studentId: string,
  lat: number,
  lng: number,
): Promise<boolean> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/update-pickup-location`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ studentId, lat, lng }),
    });

    return response.ok;
  } catch {
    return false;
  }
}
