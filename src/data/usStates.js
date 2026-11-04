// U.S. state outlines (us-atlas, Census cartographic boundaries 1:10m) used for the
// offline basemap and for state lookups (fuel prices change at state lines).
import { feature } from 'topojson-client';
import topology from 'us-atlas/states-10m.json';
import { pointInRings } from '../lib/geo.js';

export const STATE_ABBR = {
  Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO',
  Connecticut: 'CT', Delaware: 'DE', 'District of Columbia': 'DC', Florida: 'FL', Georgia: 'GA',
  Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY',
  Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN',
  Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH',
  'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND',
  Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI',
  'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT',
  Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY',
  'Puerto Rico': 'PR',
};

let cache = null;

function load() {
  if (cache) return cache;
  const geo = feature(topology, topology.objects.states);
  const index = geo.features.map((f) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    for (const poly of polys) for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { abbr: STATE_ABBR[f.properties.name] || f.properties.name, name: f.properties.name, polys, bbox: [minX, minY, maxX, maxY] };
  });
  cache = { geo, index };
  return cache;
}

export function statesGeoJSON() {
  return load().geo;
}

/** Two-letter state code containing the point, or the nearest state's code by bbox center. */
export function stateAt(lat, lng) {
  const { index } = load();
  for (const s of index) {
    const [minX, minY, maxX, maxY] = s.bbox;
    if (lng < minX || lng > maxX || lat < minY || lat > maxY) continue;
    for (const poly of s.polys) if (pointInRings(lng, lat, poly)) return s.abbr;
  }
  // Points just offshore or on a border sliver: fall back to the closest bbox.
  let best = null;
  let bestD = Infinity;
  for (const s of index) {
    const cx = Math.max(s.bbox[0], Math.min(lng, s.bbox[2]));
    const cy = Math.max(s.bbox[1], Math.min(lat, s.bbox[3]));
    const d = (cx - lng) ** 2 + (cy - lat) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s.abbr;
    }
  }
  return best;
}
