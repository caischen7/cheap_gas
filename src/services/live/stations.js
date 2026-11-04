// Live corridor station search. Samples the route every N miles and queries a
// station-price provider around each sample point:
//   - google:   Google Places API (New) Nearby Search with `fuelOptions` (station-level prices)
//   - overpass: OpenStreetMap stations via Overpass (no key) priced with CollectAPI state averages
//   - custom:   any JSON endpoint (e.g. a RapidAPI gas-price API) described by a URL template + field paths
import { http, pool } from './http.js';
import { projectOntoRoute, sampleAlongRoute, haversineMi } from '../../lib/geo.js';
import { stateAt } from '../../data/usStates.js';

const MI_TO_M = 1609.344;
// Straight-line distance understates the drive off the highway and back to it.
const ROAD_FACTOR = 1.25;
const RAMP_MI = 0.15;

export async function liveFindStations(route, opts, settings) {
  const { grade, maxDetourMi, sampleSpacingMi, onProgress } = opts;
  const samples = sampleAlongRoute(route.coords, route.cum, sampleSpacingMi);
  // Straight-line radius that covers the corridor between consecutive samples.
  const offMi = Math.max(0.3, (maxDetourMi - RAMP_MI) / ROAD_FACTOR);
  const radiusMi = Math.sqrt((sampleSpacingMi / 2) ** 2 + offMi ** 2);

  let raw;
  const notes = [];
  if (settings.stationProvider === 'google') {
    raw = await googleStations(samples, radiusMi, grade, settings, onProgress);
  } else if (settings.stationProvider === 'custom') {
    raw = await customStations(samples, radiusMi, grade, settings, onProgress);
  } else {
    raw = await overpassStations(samples, offMi, grade, settings, onProgress);
    notes.push('Prices are CollectAPI state averages applied to OpenStreetMap stations, so stations in the same state share a price.');
  }

  // Deduplicate, then measure each station against the route.
  const seen = new Map();
  for (const s of raw) {
    const key = s.id || `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`;
    if (!seen.has(key)) seen.set(key, s);
  }
  const all = [];
  for (const s of seen.values()) {
    const proj = projectOntoRoute([s.lat, s.lng], route.coords, route.cum, s.sampleMile != null ? { mile: s.sampleMile, window: radiusMi * 3 + 5 } : undefined);
    const detourMi = proj.offRouteMi * ROAD_FACTOR + RAMP_MI;
    all.push({ ...s, mile: proj.mile, offRouteMi: proj.offRouteMi, detourMi: +detourMi.toFixed(2), state: s.state || stateAt(s.lat, s.lng) });
  }
  const priced = all.filter((s) => Number.isFinite(s.price) && s.price > 0.5);
  if (all.length && !priced.length) notes.push(`None of the stations found report a ${grade} price.`);
  return {
    stations: priced.filter((s) => s.detourMi <= maxDetourMi).sort((a, b) => a.mile - b.mile),
    allNearby: priced,
    samplesQueried: samples.length,
    notes,
  };
}

// ---------- Google Places API (New) ----------
const GOOGLE_FUEL = { regular: ['REGULAR_UNLEADED'], midgrade: ['MIDGRADE'], premium: ['PREMIUM'], diesel: ['DIESEL', 'TRUCK_DIESEL'] };

async function googleStations(samples, radiusMi, grade, settings, onProgress) {
  if (!settings.googleKey) throw new Error('Add a Google Maps Platform API key with Places API (New) enabled in Settings.');
  const radius = Math.min(50000, radiusMi * MI_TO_M);
  const results = await pool(
    samples,
    4,
    async (s) => {
      const data = await http('https://places.googleapis.com/v1/places:searchNearby', {
        service: 'Google Places',
        corsProxy: settings.corsProxy,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': settings.googleKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,places.location,places.fuelOptions',
        },
        body: JSON.stringify({
          includedTypes: ['gas_station'],
          maxResultCount: 20,
          rankPreference: 'DISTANCE',
          locationRestriction: { circle: { center: { latitude: s.point[0], longitude: s.point[1] }, radius } },
        }),
      });
      return (data.places || []).map((p) => {
        const fp = (p.fuelOptions?.fuelPrices || []).find((f) => GOOGLE_FUEL[grade].includes(f.type));
        const price = fp ? Number(fp.price?.units || 0) + (fp.price?.nanos || 0) / 1e9 : NaN;
        const name = p.displayName?.text || 'Gas station';
        return {
          id: p.id,
          name,
          brand: brandFromName(name),
          address: p.shortFormattedAddress || p.formattedAddress || '',
          lat: p.location.latitude,
          lng: p.location.longitude,
          price,
          priceSource: 'Google Places',
          updatedMinutesAgo: fp?.updateTime ? Math.max(0, Math.round((Date.now() - Date.parse(fp.updateTime)) / 60000)) : null,
          sampleMile: s.mile,
        };
      });
    },
    onProgress,
  );
  return collect(results, 'Google Places');
}

// ---------- OpenStreetMap Overpass + CollectAPI ----------
async function overpassStations(samples, offMi, grade, settings, onProgress) {
  if (!settings.collectApiKey) throw new Error('Add a CollectAPI key (Gas Prices API) in Settings, or pick a different station provider.');
  const endpoint = settings.overpassUrl || 'https://overpass-api.de/api/interpreter';
  const chunks = [];
  for (let i = 0; i < samples.length; i += 12) chunks.push(samples.slice(i, i + 13));
  const radius = Math.round(offMi * MI_TO_M);
  const results = await pool(
    chunks,
    2,
    async (chunk) => {
      const line = chunk.map((s) => `${s.point[0].toFixed(5)},${s.point[1].toFixed(5)}`).join(',');
      const query = `[out:json][timeout:60];nwr["amenity"="fuel"](around:${radius},${line});out center tags;`;
      const data = await http(endpoint, {
        service: 'Overpass (OpenStreetMap)',
        corsProxy: settings.corsProxy,
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        timeoutMs: 70000,
      });
      return (data.elements || []).map((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lng = el.lon ?? el.center?.lon;
        const t = el.tags || {};
        const name = t.name || t.brand || 'Gas station';
        const nearest = chunk.reduce((b, s) => (haversineMi(s.point, [lat, lng]) < haversineMi(b.point, [lat, lng]) ? s : b), chunk[0]);
        return {
          id: `osm-${el.type}-${el.id}`,
          name,
          brand: t.brand || brandFromName(name),
          address: [[t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '), t['addr:city'], t['addr:state']].filter(Boolean).join(', '),
          lat,
          lng,
          sampleMile: nearest.mile,
          supportsDiesel: t['fuel:diesel'] === 'yes',
        };
      });
    },
    onProgress,
  );
  const stations = collect(results, 'Overpass').filter((s) => s.lat != null && (grade !== 'diesel' || s.supportsDiesel !== false));
  const states = [...new Set(stations.map((s) => (s.state = stateAt(s.lat, s.lng))))];
  const prices = {};
  await pool(states, 3, async (st) => {
    const data = await http(`https://api.collectapi.com/gasPrice/stateUsaPrice?state=${st}`, {
      service: 'CollectAPI Gas Prices',
      corsProxy: settings.corsProxy,
      headers: { 'content-type': 'application/json', authorization: `apikey ${settings.collectApiKey}` },
    });
    const s = data?.result?.state || {};
    const field = { regular: 'gasoline', midgrade: 'midGrade', premium: 'premium', diesel: 'diesel' }[grade];
    prices[st] = Number(s[field]);
  });
  return stations.map((s) => ({ ...s, price: prices[s.state], priceSource: 'CollectAPI state average', updatedMinutesAgo: null }));
}

// ---------- Custom JSON endpoint (RapidAPI and similar) ----------
function getPath(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

async function customStations(samples, radiusMi, grade, settings, onProgress) {
  const c = settings.custom || {};
  if (!c.url) throw new Error('Set the custom station endpoint URL template in Settings.');
  let headers = {};
  try {
    headers = c.headers ? JSON.parse(c.headers) : {};
  } catch {
    throw new Error('Custom endpoint headers must be valid JSON, e.g. {"X-RapidAPI-Key": "..."}');
  }
  const fill = (tpl, s) =>
    tpl
      .replaceAll('{lat}', s.point[0].toFixed(5))
      .replaceAll('{lng}', s.point[1].toFixed(5))
      .replaceAll('{radius_mi}', radiusMi.toFixed(1))
      .replaceAll('{radius_m}', String(Math.round(radiusMi * MI_TO_M)))
      .replaceAll('{grade}', grade);
  const results = await pool(
    samples,
    3,
    async (s) => {
      const data = await http(fill(c.url, s), { service: 'Custom station API', corsProxy: settings.corsProxy, headers });
      const list = c.listPath ? getPath(data, c.listPath) : data;
      if (!Array.isArray(list)) throw new Error('Custom station API: the list path does not point to an array.');
      return list.map((item, i) => {
        const name = String(getPath(item, c.namePath || 'name') ?? 'Gas station');
        return {
          id: String(getPath(item, c.idPath || 'id') ?? `${s.mile}-${i}`),
          name,
          brand: String(getPath(item, c.brandPath || 'brand') ?? brandFromName(name)),
          address: String(getPath(item, c.addressPath || 'address') ?? ''),
          lat: Number(getPath(item, c.latPath || 'lat')),
          lng: Number(getPath(item, c.lngPath || 'lng')),
          price: Number(getPath(item, (c.pricePath || 'price').replaceAll('{grade}', grade))),
          priceSource: 'Custom API',
          updatedMinutesAgo: null,
          sampleMile: s.mile,
        };
      });
    },
    onProgress,
  );
  return collect(results, 'Custom station API').filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng));
}

function collect(results, service) {
  const ok = results.filter((r) => r.ok);
  if (!ok.length && results.length) {
    const first = results.find((r) => !r.ok)?.error;
    throw first instanceof Error ? first : new Error(`${service} returned no results.`);
  }
  return ok.flatMap((r) => r.value);
}

const KNOWN_BRANDS = ["Love's", 'Pilot', 'Flying J', 'TA', 'Petro', 'Shell', 'Chevron', 'Exxon', 'Mobil', 'BP', 'Valero', 'Phillips 66', 'Conoco', 'Sinclair', 'Maverik', 'ARCO', "Buc-ee's", 'QuikTrip', 'QT', 'RaceTrac', 'Sheetz', 'Wawa', "Casey's", 'Kwik Trip', 'Speedway', 'Murphy USA', 'Circle K', 'Costco', "Sam's Club", 'Marathon', 'Sunoco', 'Citgo', 'Holiday', 'Kum & Go', 'Speedway', '76', 'Gulf', 'Texaco'];

export function brandFromName(name = '') {
  const n = name.toLowerCase();
  return KNOWN_BRANDS.find((b) => n.includes(b.toLowerCase())) || name.split(/[#\-–]/)[0].trim() || 'Independent';
}
