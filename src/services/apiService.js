// Service layer. One interface, two interchangeable backends:
//   demo -> simulated Interstate corridors, stations and prices (works offline / in the artifact preview)
//   live -> EPA fueleconomy.gov, OSRM or Mapbox, Photon or Mapbox geocoding, and a station-price provider
import { demoProvider } from './demo/demoProvider.js';
import { epaVehicles } from './live/epa.js';
import { liveGeocode, liveRoute } from './live/routing.js';
import { liveFindStations } from './live/stations.js';

export const DEFAULT_SETTINGS = {
  mode: 'demo',
  routingProvider: 'osrm',
  osrmUrl: 'https://router.project-osrm.org',
  geocoder: 'photon',
  stationProvider: 'google',
  sampleSpacingMi: 20,
  mapboxToken: '',
  googleKey: '',
  collectApiKey: '',
  overpassUrl: 'https://overpass-api.de/api/interpreter',
  corsProxy: '',
  custom: {
    url: '',
    headers: '',
    listPath: 'stations',
    idPath: 'id',
    namePath: 'name',
    brandPath: 'brand',
    addressPath: 'address',
    latPath: 'lat',
    lngPath: 'lng',
    pricePath: 'prices.{grade}',
  },
  streetTiles: true,
};

const STORAGE_KEY = 'rtfo.settings.v1';

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved) return { ...DEFAULT_SETTINGS, ...saved, custom: { ...DEFAULT_SETTINGS.custom, ...(saved.custom || {}) } };
  } catch {
    /* storage unavailable: fall back to defaults */
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false;
  }
}

const AREA_WINDOW_MI = 25;

/** Attach the local-area average (stations within ±25 route miles) and compute the corridor average. */
function withAverages(result) {
  const all = [...result.allNearby].sort((a, b) => a.mile - b.mile);
  const prices = all.map((s) => s.price);
  const routeAvg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
  const areaAvg = (mile) => {
    let sum = 0;
    let n = 0;
    for (const s of all) {
      if (s.mile < mile - AREA_WINDOW_MI) continue;
      if (s.mile > mile + AREA_WINDOW_MI) break;
      sum += s.price;
      n++;
    }
    return n ? sum / n : routeAvg;
  };
  return {
    ...result,
    routeAvg,
    stations: result.stations.map((s) => ({ ...s, areaAvg: areaAvg(s.mile) })),
  };
}

export function createApiService(settings) {
  if (settings.mode === 'demo') {
    return {
      mode: 'demo',
      geocode: (q) => demoProvider.geocode(q),
      route: (o, d) => demoProvider.route(o, d),
      findStations: async (route, opts) => withAverages(await demoProvider.findStations(route, opts)),
      vehicles: demoProvider.vehicles,
    };
  }
  return {
    mode: 'live',
    geocode: (q, near) => liveGeocode(q, settings, near),
    route: (o, d) => liveRoute(o, d, settings),
    findStations: async (route, opts) => withAverages(await liveFindStations(route, opts, settings)),
    vehicles: epaVehicles(settings.corsProxy),
  };
}
