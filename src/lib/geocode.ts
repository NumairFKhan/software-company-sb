/**
 * Geocode a US zip code to latitude/longitude using Nominatim (OpenStreetMap).
 *
 * Nominatim is free and requires no API key, but does require a descriptive
 * User-Agent per the usage policy: https://nominatim.org/release-docs/latest/api/Overview/
 *
 * Returns null if the zip code cannot be geocoded.
 */
export interface LatLng {
  lat: number;
  lng: number;
}

export async function geocodeZip(zip: string): Promise<LatLng | null> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("postalcode", zip);
  url.searchParams.set("country", "US");
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": "CourtSide/1.0 (coach-booking-platform; contact@courtside.app)",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as Array<{ lat: string; lon: string }>;

  if (!data || data.length === 0) {
    return null;
  }

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
  };
}
