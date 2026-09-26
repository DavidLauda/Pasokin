function isValidPoint(lat, lng) {
  return [lat, lng].every(value => value !== null && value !== undefined &&
    String(value).trim() !== '' && Number.isFinite(Number(value))) &&
    Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180;
}

function haversineDistance(lat1, lng1, lat2, lng2) {
  if (!isValidPoint(lat1, lng1) || !isValidPoint(lat2, lng2)) return null;
  const [aLat, aLng, bLat, bLng] = [lat1, lng1, lat2, lng2].map(Number);
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLng = (bLng - aLng) * toRad;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

module.exports = { haversineDistance, isValidPoint };
