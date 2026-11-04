// Live routing and geocoding providers.
//   Routing: OSRM (public demo server, no key) or Mapbox Directions (token).
//   Geocoding: Photon by Komoot (no key, built for autocomplete) or Mapbox Geocoding v6 (token).
import { http } from './http.js';
import { cumulativeMiles, densify } from '../../lib/geo.js';

const METERS_PER_MILE = 1609.344;

export async function liveRoute(origin, destination, settings) {
  const { routingProvider, mapboxToken, osrmUrl, corsProxy } = settings;
  const pair = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  let data;
  let provider;
  if (routingProvider === 'mapbox') {
    if (!mapboxToken) throw new Error('Add a Mapbox access token in Settings, or switch routing to OSRM.');
    data = await http(
      `https://api.mapbox.com/directions/v5/mapbox/driving/${pair}?geometries=geojson&overview=full&access_token=${encodeURIComponent(mapboxToken)}`,
      { service: 'Mapbox Directions', corsProxy },
    );
    provider = 'Mapbox Directions';
  } else {
    const base = (osrmUrl || 'https://router.project-osrm.org').replace(/\/$/, '');
    data = await http(`${base}/route/v1/driving/${pair}?overview=full&geometries=geojson&steps=false`, { service: 'OSRM', corsProxy });
    provider = 'OSRM';
  }
  const r = data.routes?.[0];
  if (!r) throw new Error(`${provider} found no drivable route between those places.`);
  const raw = r.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  const coords = densify(raw, 1.5);
  const cum = cumulativeMiles(coords);
  // Scale geometric mileage to the router's road distance so mile markers match.
  const roadMi = r.distance / METERS_PER_MILE;
  const k = roadMi / cum[cum.length - 1];
  const scaled = cum.map((m) => m * k);
  return {
    coords,
    cum: scaled,
    distanceMi: roadMi,
    durationMin: r.duration / 60,
    highways: [],
    towns: [],
    provider,
  };
}

export async function liveGeocode(query, settings, near) {
  const { geocoder, mapboxToken, corsProxy } = settings;
  if (query.trim().length < 3) return [];
  if (geocoder === 'mapbox' && mapboxToken) {
    const data = await http(
      `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(query)}&country=us&autocomplete=true&limit=6&access_token=${encodeURIComponent(mapboxToken)}`,
      { service: 'Mapbox Geocoding', corsProxy },
    );
    return (data.features || []).map((f) => ({
      label: f.properties.full_address || f.properties.name,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    }));
  }
  const bias = near ? `&lat=${near.lat}&lon=${near.lng}` : '';
  const data = await http(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6&lang=en&bbox=-125.0,24.0,-66.5,49.5${bias}`,
    { service: 'Photon geocoder', corsProxy },
  );
  return (data.features || []).map((f) => {
    const p = f.properties;
    const line1 = [p.housenumber, p.street].filter(Boolean).join(' ') || p.name;
    const label = [line1, p.city && p.city !== line1 ? p.city : null, p.state].filter(Boolean).join(', ');
    return { label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
  });
}
