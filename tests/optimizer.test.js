import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeTrip, planParams } from '../src/lib/optimizer.js';

const vehicle = { tankGallons: 15, highwayMpg: 30 };
const trip = { startFuelPct: 100, safetyBufferPct: 15, mpgMarginPct: 0 };

function stationsEvery(step, L, priceAt) {
  const out = [];
  for (let m = step; m < L; m += step) out.push({ id: `s${m}`, name: `S${m}`, mile: m, detourMi: 0.5, price: priceAt(m), areaAvg: 3.5 });
  return out;
}

function simulate(plan, L, p) {
  let fuel = p.startGal;
  let mile = 0;
  for (const s of plan.stops) {
    fuel -= (s.mile - mile + s.station.detourMi) / p.mpg;
    assert.ok(fuel >= p.reserveGal - 1e-6, `arrived at stop ${s.n} below reserve: ${fuel}`);
    fuel += s.gallons;
    assert.ok(fuel <= p.tank + 1e-6, 'overfilled tank');
    fuel -= s.station.detourMi / p.mpg;
    mile = s.mile;
  }
  fuel -= (L - mile) / p.mpg;
  assert.ok(fuel >= p.reserveGal - 1e-6, `arrived at destination below reserve: ${fuel}`);
}

test('range math applies MPG margin and buffer', () => {
  const p = planParams(vehicle, { ...trip, mpgMarginPct: 10 });
  assert.equal(p.mpg, 27);
  assert.equal(p.maxRange, 405);
  assert.ok(Math.abs(p.usableRange - 344.25) < 1e-9);
});

test('no stops when the tank covers the trip', () => {
  const r = optimizeTrip({ distanceMi: 300, stations: stationsEvery(20, 300, () => 3), vehicle, trip });
  assert.equal(r.noStopsNeeded, true);
  assert.equal(r.maxSavings.stops.length, 0);
});

test('both strategies stay above the reserve and the savings plan is not more expensive', () => {
  const L = 1400;
  // Expensive first half (CA-like), cheap second half.
  const stations = stationsEvery(18, L, (m) => (m < 500 ? 4.7 : 3.0) + ((m * 7) % 13) / 100);
  const r = optimizeTrip({ distanceMi: L, stations, vehicle, trip });
  assert.ok(!r.error, r.error);
  simulate(r.maxSavings, L, r.params);
  simulate(r.minStops, L, r.params);
  assert.ok(r.maxSavings.totalCost <= r.minStops.totalCost + 0.01, `${r.maxSavings.totalCost} > ${r.minStops.totalCost}`);
  assert.ok(r.minStops.stops.length <= r.maxSavings.stops.length);
  // Savings plan should buy only a little in the expensive stretch.
  const expensiveGal = r.maxSavings.stops.filter((s) => s.mile < 500).reduce((a, s) => a + s.gallons, 0);
  const cheapGal = r.maxSavings.stops.filter((s) => s.mile >= 500).reduce((a, s) => a + s.gallons, 0);
  assert.ok(expensiveGal < cheapGal);
});

test('reports a gap no tank can cover', () => {
  const stations = [{ id: 'a', mile: 100, detourMi: 0.2, price: 3 }, { id: 'b', mile: 700, detourMi: 0.2, price: 3 }];
  const r = optimizeTrip({ distanceMi: 900, stations, vehicle, trip });
  assert.match(r.error, /stretch/);
});

test('low starting fuel forces an early stop', () => {
  const L = 600;
  const r = optimizeTrip({ distanceMi: L, stations: stationsEvery(15, L, () => 3.2), vehicle, trip: { ...trip, startFuelPct: 10 } });
  assert.ok(!r.error, r.error);
  assert.ok(r.minStops.stops[0].mile < 45);
});
