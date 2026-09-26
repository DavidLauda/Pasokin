async function geocodeAddress(address) {
  const key = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!key || !address || address.trim().length < 10) return null;

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', address.trim());
  url.searchParams.set('key', key);

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const result = await response.json();
    if (result.status !== 'OK') return null;
    const location = result.results?.[0]?.geometry?.location;
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) ||
        lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  } catch {
    // A geocoding outage must not block supplier registration.
    return null;
  }
}

module.exports = { geocodeAddress };
