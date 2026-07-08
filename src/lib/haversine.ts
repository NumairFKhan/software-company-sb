/**
 * Haversine formula — great-circle distance between two lat/lng points on Earth.
 *
 * Returns the distance in miles.  Suitable for MVP-scale filtering of coaches
 * within a search radius without needing a PostGIS extension.
 */

const EARTH_RADIUS_MILES = 3958.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Compute the distance in miles between two geographic coordinates.
 *
 * @param lat1  Latitude of point 1 (degrees)
 * @param lng1  Longitude of point 1 (degrees)
 * @param lat2  Latitude of point 2 (degrees)
 * @param lng2  Longitude of point 2 (degrees)
 * @returns     Distance in miles (non-negative)
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}
