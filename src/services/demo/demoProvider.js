// Realistic Demo Mode: routes follow the real Interstate corridors in
// data/interstates.js; stations and prices are simulated deterministically so the
// same exit shows the same stations on every run, with prices that drift slightly by day.
import { HUBS, CORRIDORS, DEMO_PLACES } from '../../data/interstates.js';
import { brandsForState, basePrice } from '../../data/demoPricing.js';
import { DEMO_YEARS, demoMakes, demoModels, demoTrims, demoVehicle } from '../../data/demoVehicles.js';
import { stateAt } from '../../data/usStates.js';
import { cumulativeMiles, densify, haversineMi, pointAtMile, seededRandom } from '../../lib/geo.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Graph ----------
let graph = null;
function buildGraph() {
  if (graph) return graph;
  const adj = {};
  for (const id of Object.keys(HUBS)) adj[id] = [];
  for (const [a, b, hwy, towns] of CORRIDORS) {
    const pts = [[HUBS[a][1], HUBS[a][2]], ...towns.map((t) => [t[1], t[2]]), [HUBS[b][1], HUBS[b][2]]];
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += haversineMi(pts[i - 1], pts[i]);
    const edge = { a, b, hwy, towns, pts, len };
    adj[a].push({ to: b, edge, reverse: false });
    adj[b].push({ to: a, edge, reverse: true });
  }
  graph = adj;
  return graph;
}

function shortestPath(from, to) {
  const adj = buildGraph();
  const dist = { [from]: 0 };
  const prev = {};
  const done = new Set();
  while (true) {
    let u = null;
    for (const k of Object.keys(dist)) if (!done.has(k) && (u === null || dist[k] < dist[u])) u = k;
    if (u === null) return null;
    if (u === to) break;
    done.add(u);
    for (const step of adj[u]) {
      const nd = dist[u] + step.edge.len;
      if (dist[step.to] === undefined || nd < dist[step.to]) {
        dist[step.to] = nd;
        prev[step.to] = { from: u, step };
      }
    }
  }
  const steps = [];
  for (let v = to; v !== from; v = prev[v].from) steps.unshift(prev[v].step);
  return steps;
}

function nearestHub(lat, lng) {
  let best = null;
  let bestD = Infinity;
  for (const [id, [, hl, hg]] of Object.entries(HUBS)) {
    const d = haversineMi([lat, lng], [hl, hg]);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return { id: best, distance: bestD };
}

// ---------- Places ----------
async function geocode(query) {
  await wait(60);
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return DEMO_PLACES.filter((p) => p.label.toLowerCase().includes(q))
    .slice(0, 8)
    .map((p) => ({ label: p.label, lat: p.lat, lng: p.lng, hubId: p.id }));
}

// ---------- Route ----------
async function route(origin, destination) {
  await wait(250);
  const o = origin.hubId ?? nearestHub(origin.lat, origin.lng).id;
  const d = destination.hubId ?? nearestHub(destination.lat, destination.lng).id;
  if (o === d) throw new Error('Origin and destination are the same city. Pick two different cities.');
  const steps = shortestPath(o, d);
  if (!steps) throw new Error('No Interstate connection between those cities in the demo network.');

  let coords = [[HUBS[o][1], HUBS[o][2]]];
  const towns = [{ name: HUBS[o][0].split(',')[0], point: coords[0] }];
  const legs = [];
  for (const { edge, reverse } of steps) {
    const pts = reverse ? [...edge.pts].reverse() : edge.pts;
    const tw = reverse ? [...edge.towns].reverse() : edge.towns;
    const startIdx = coords.length - 1;
    coords = coords.concat(pts.slice(1));
    legs.push({ hwy: edge.hwy, startIdx, endIdx: coords.length - 1 });
    for (const t of tw) towns.push({ name: t[0], point: [t[1], t[2]] });
    const endHub = reverse ? edge.a : edge.b;
    towns.push({ name: HUBS[endHub][0].split(',')[0], point: [HUBS[endHub][1], HUBS[endHub][2]] });
  }
  // Map vertex indexes to mileage, then densify for smooth projections.
  const rawCum = cumulativeMiles(coords);
  const highways = legs.map((l) => ({ hwy: l.hwy, fromMile: rawCum[l.startIdx], toMile: rawCum[l.endIdx] }));
  const dense = densify(coords, 1.5);
  const cum = cumulativeMiles(dense);
  const distanceMi = cum[cum.length - 1];
  // Town mileage = cumulative distance at the matching raw vertex.
  let vi = 0;
  const townMiles = towns.map((t) => {
    while (vi < coords.length - 1 && haversineMi(coords[vi], t.point) > 0.01) vi++;
    return { ...t, mile: rawCum[vi] ?? 0 };
  });
  return {
    coords: dense,
    cum,
    distanceMi,
    durationMin: (distanceMi / 63) * 60,
    highways,
    towns: dedupeTowns(townMiles),
    provider: 'Demo Interstate network',
    snapped: { origin: HUBS[o][0], destination: HUBS[d][0] },
  };
}

function dedupeTowns(towns) {
  const out = [];
  for (const t of towns) if (!out.some((o) => o.name === t.name && Math.abs(o.mile - t.mile) < 1)) out.push(t);
  return out;
}

// ---------- Stations ----------
function stateSegments(coords, cum) {
  const segs = [];
  const total = cum[cum.length - 1];
  for (let m = 0; m <= total; m += 2) {
    const p = pointAtMile(coords, cum, m);
    const st = stateAt(p[0], p[1]);
    const last = segs[segs.length - 1];
    if (last && last.state === st) {
      last.toMile = m;
      last.endPt = p;
    } else segs.push({ state: st, fromMile: m, toMile: m, startPt: p, endPt: p });
  }
  segs[segs.length - 1].toMile = total;
  return segs;
}

function exitNumber(seg, mile) {
  // Interstate exits count up from the west or south state line.
  const dLat = seg.endPt[0] - seg.startPt[0];
  const dLng = seg.endPt[1] - seg.startPt[1];
  const increasing = Math.abs(dLng) >= Math.abs(dLat) ? dLng > 0 : dLat > 0;
  const into = mile - seg.fromMile;
  const len = seg.toMile - seg.fromMile;
  return Math.max(1, Math.round(increasing ? into : len - into) + 1);
}

function dailyDrift(seed) {
  const day = Math.floor(Date.now() / 86400000);
  return (seededRandom(`${seed}|${day}`)() - 0.5) * 0.06;
}

/**
 * Simulated corridor search: clusters of stations at towns and Interstate exits between
 * them, priced from state baselines, brand positioning and per-station noise.
 */
async function findStations(rt, { grade, maxDetourMi, sampleSpacingMi, onProgress }) {
  const { coords, cum, distanceMi, towns, highways } = rt;
  const segs = stateSegments(coords, cum);
  const stateAtMile = (m) => segs.find((s) => m >= s.fromMile && m <= s.toMile) ?? segs[segs.length - 1];
  const hwyAtMile = (m) => {
    const h = highways.find((x) => m >= x.fromMile && m <= x.toMile) ?? highways[0];
    if (!h) return '';
    // Combined labels like "I-20 / I-10": use the first highway for the first half of the leg.
    const parts = h.hwy.split(' / ');
    return parts.length > 1 && m > (h.fromMile + h.toMile) / 2 ? parts[parts.length - 1] : parts[0];
  };
  const nearestTown = (m) => towns.reduce((best, t) => (Math.abs(t.mile - m) < Math.abs(best.mile - m) ? t : best), towns[0]);

  // Exit locations: every town plus rural exits roughly every 9–22 miles.
  const exits = [];
  for (const t of towns) exits.push({ mile: t.mile, cluster: true, key: t.name });
  for (let m = 6; m < distanceMi - 3; ) {
    const p = pointAtMile(coords, cum, m);
    const rnd = seededRandom(`exit|${p[0].toFixed(1)}|${p[1].toFixed(1)}`);
    if (!exits.some((e) => Math.abs(e.mile - m) < 5)) exits.push({ mile: m, cluster: false, key: `${p[0].toFixed(1)},${p[1].toFixed(1)}` });
    m += 9 + rnd() * 13;
  }
  exits.sort((a, b) => a.mile - b.mile);

  const stations = [];
  const totalSamples = Math.max(1, Math.ceil(distanceMi / sampleSpacingMi));
  let reported = 0;
  for (const ex of exits) {
    const sampleIdx = Math.floor(ex.mile / sampleSpacingMi);
    if (sampleIdx > reported) {
      reported = sampleIdx;
      onProgress?.(Math.min(1, sampleIdx / totalSamples));
      if (sampleIdx % 8 === 0) await wait(0);
    }
    const seg = stateAtMile(ex.mile);
    const state = seg.state;
    const rnd = seededRandom(`stations|${ex.key}`);
    const brands = brandsForState(state);
    const count = ex.cluster ? 3 + Math.floor(rnd() * 4) : rnd() < 0.18 ? 0 : 1 + Math.floor(rnd() * 3);
    const town = nearestTown(ex.mile);
    const hwy = hwyAtMile(ex.mile);
    const exitNo = exitNumber(seg, ex.mile);
    // Direction of travel at this exit, for placing stations beside the highway.
    const a = pointAtMile(coords, cum, Math.max(0, ex.mile - 0.5));
    const b = pointAtMile(coords, cum, Math.min(distanceMi, ex.mile + 0.5));
    const k = Math.cos((a[0] * Math.PI) / 180);
    const dx = (b[1] - a[1]) * k;
    const dy = b[0] - a[0];
    const n = Math.hypot(dx, dy) || 1;
    const perp = [dx / n, -dy / n]; // unit normal in (lat, lng*cos) space

    for (let i = 0; i < count; i++) {
      const pool = ex.cluster ? brands : brands.filter((x) => !x.club);
      let pick = pool[Math.floor(rnd() * pool.length)];
      if (!ex.cluster && rnd() < 0.45) {
        const trucks = pool.filter((x) => x.truck);
        pick = trucks[Math.floor(rnd() * trucks.length)];
      }
      const side = rnd() < 0.5 ? -1 : 1;
      const offRoute = pick.club ? 1.4 + rnd() * 3.2 : pick.truck ? 0.1 + rnd() * 0.35 : 0.1 + rnd() * (ex.cluster ? 2.6 : 0.9);
      const along = (rnd() - 0.5) * (ex.cluster ? 3 : 0.6);
      const mile = Math.min(distanceMi, Math.max(0, ex.mile + along));
      const base = pointAtMile(coords, cum, mile);
      const latOff = (perp[0] * side * offRoute) / 69;
      const lngOff = (perp[1] * side * offRoute) / (69.17 * k);
      const id = `demo-${ex.key}-${i}`;
      const exitPremium = offRoute < 0.4 ? 0.04 : offRoute > 1.5 ? -0.05 : 0;
      const noise = (rnd() - 0.5) * 0.16;
      const raw = basePrice(state, grade) + pick.offset + exitPremium + noise + dailyDrift(id);
      const price = Math.floor(raw * 100) / 100 + 0.009;
      const storeNo = 100 + Math.floor(rnd() * 900);
      stations.push({
        id,
        name: pick.truck || pick.club ? `${pick.label} #${storeNo}` : `${pick.label} – ${town.name}`,
        brand: pick.brand,
        address: `${hwy} Exit ${exitNo}, ${town.name}, ${state}`,
        state,
        lat: base[0] + latOff,
        lng: base[1] + lngOff,
        mile,
        offRouteMi: offRoute,
        detourMi: +(offRoute * 1.2).toFixed(2),
        price,
        priceSource: 'simulated',
        updatedMinutesAgo: 4 + Math.floor(rnd() * 170),
      });
    }
  }
  onProgress?.(1);
  return {
    stations: stations.filter((s) => s.detourMi <= maxDetourMi * 1.0001),
    allNearby: stations,
    samplesQueried: totalSamples + 1,
    notes: ['Demo prices are simulated from state baselines and brand positioning. They are not live.'],
  };
}

// ---------- Vehicle lookup ----------
const vehicles = {
  years: async () => DEMO_YEARS,
  makes: async () => demoMakes(),
  models: async (_year, make) => demoModels(make),
  options: async (_year, make, model) => demoTrims(make, model).map((t) => ({ value: t.id, text: t.label })),
  details: async (id, year) => demoVehicle(id, year),
};

export const demoProvider = { mode: 'demo', geocode, route, findStations, vehicles };
