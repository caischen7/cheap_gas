// Geometry helpers. Coordinates are [lat, lng] pairs throughout the app.

const EARTH_RADIUS_MI = 3958.7613;
const toRad = (d) => (d * Math.PI) / 180;

/** Great-circle distance in miles between two [lat, lng] points. */
export function haversineMi(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Cumulative mileage at each vertex of a polyline. */
export function cumulativeMiles(coords) {
  const out = new Array(coords.length);
  out[0] = 0;
  for (let i = 1; i < coords.length; i++) out[i] = out[i - 1] + haversineMi(coords[i - 1], coords[i]);
  return out;
}

/** Point at a given mileage along a polyline (linear interpolation between vertices). */
export function pointAtMile(coords, cum, mile) {
  if (mile <= 0) return coords[0];
  const total = cum[cum.length - 1];
  if (mile >= total) return coords[coords.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= mile) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (mile - cum[lo]) / seg;
  return [
    coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t,
    coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t,
  ];
}

/** Sample points every `spacingMi` miles along the route, always including both ends. */
export function sampleAlongRoute(coords, cum, spacingMi) {
  const total = cum[cum.length - 1];
  const samples = [];
  for (let m = 0; m < total; m += spacingMi) samples.push({ mile: m, point: pointAtMile(coords, cum, m) });
  samples.push({ mile: total, point: coords[coords.length - 1] });
  return samples;
}

/** Local equirectangular projection (miles) around a reference latitude. */
function project(p, refLat) {
  const k = Math.cos(toRad(refLat));
  return [p[1] * 69.172 * k, p[0] * 69.0];
}

/**
 * Project a point onto the route. Returns the mileage of the closest point on the
 * polyline and the straight-line distance (miles) from the route.
 * `hint` narrows the search to vertices near a known mileage for speed.
 */
export function projectOntoRoute(point, coords, cum, hint) {
  let start = 0;
  let end = coords.length - 1;
  if (hint) {
    start = Math.max(0, lowerIndex(cum, hint.mile - hint.window));
    end = Math.min(coords.length - 1, lowerIndex(cum, hint.mile + hint.window) + 1);
  }
  const P = project(point, point[0]);
  let best = { mile: 0, offRouteMi: Infinity };
  for (let i = start; i < end; i++) {
    const A = project(coords[i], point[0]);
    const B = project(coords[i + 1], point[0]);
    const dx = B[0] - A[0];
    const dy = B[1] - A[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((P[0] - A[0]) * dx + (P[1] - A[1]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = A[0] + t * dx;
    const cy = A[1] + t * dy;
    const d = Math.hypot(P[0] - cx, P[1] - cy);
    if (d < best.offRouteMi) best = { mile: cum[i] + (cum[i + 1] - cum[i]) * t, offRouteMi: d };
  }
  return best;
}

function lowerIndex(cum, mile) {
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < mile) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo - 1);
}

/** Ramer–Douglas–Peucker simplification (tolerance in miles) for rendering long routes. */
export function simplify(coords, toleranceMi = 0.05) {
  if (coords.length < 3) return coords;
  const refLat = coords[0][0];
  const pts = coords.map((c) => project(c, refLat));
  const keep = new Uint8Array(coords.length);
  keep[0] = keep[coords.length - 1] = 1;
  const stack = [[0, coords.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let maxD = 0;
    let idx = -1;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > toleranceMi && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return coords.filter((_, i) => keep[i]);
}

/** Densify a polyline so no segment is longer than `maxSegMi` (keeps projections accurate). */
export function densify(coords, maxSegMi = 2) {
  const out = [coords[0]];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const n = Math.ceil(haversineMi(a, b) / maxSegMi);
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/** Ray-casting point-in-polygon for GeoJSON rings ([lng, lat] order). */
export function pointInRings(lng, lat, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Deterministic PRNG seeded from a string (mulberry32 over a string hash). */
export function seededRandom(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
