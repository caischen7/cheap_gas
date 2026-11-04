// Fuel stop optimization.
//
// Inputs share one model: the route is a line from mile 0 to mile L; each station
// sits at a route mile with a one-way detour (drive off the highway and back = 2×detour).
// Fuel is tracked in gallons. Planning uses an *effective* MPG = EPA highway MPG
// reduced by the real-world margin, so cars that burn fuel faster still arrive safely.
//
//   MaxRange    = TankGallons × EffectiveMPG
//   UsableRange = MaxRange × (1 − SafetyBuffer)
//   Detour      : reaching the pump costs detour/MPG gallons, returning costs the same,
//                 and the station's true cost adds (2 × detour / MPG) × price.
//
// Strategy 1 (Maximum Savings) is a dynamic program over (station, fuel level) that
// minimizes dollars spent; a stop is only added when it saves at least $1, so the
// plan stays reasonable. It can buy partial tanks to reach a cheaper station or state ahead.
// Strategy 2 (Minimum Stops + Low Cost) drives into the last 15–25% of the tank, picks
// the cheapest true-cost station in that refueling window and fills up. If that ever
// costs an extra stop, it falls back to the stop-minimizing DP.

const MIN_PURCHASE_GAL = 3;
// Maximum Savings only adds a stop when it saves at least this much (keeps stops reasonable).
export const EXTRA_STOP_THRESHOLD = 1.0;

export function planParams(vehicle, trip) {
  const tank = vehicle.tankGallons;
  const mpgDerate = trip.mpgMarginPct / 100;
  const mpg = vehicle.highwayMpg * (1 - mpgDerate);
  const buffer = trip.safetyBufferPct / 100;
  const maxRange = tank * mpg;
  return {
    tank,
    mpg,
    ratedMpg: vehicle.highwayMpg,
    buffer,
    reserveGal: tank * buffer,
    startGal: tank * (trip.startFuelPct / 100),
    maxRange,
    usableRange: maxRange * (1 - buffer),
    bufferMiles: tank * buffer * mpg,
  };
}

/**
 * @returns {{ maxSavings: Plan, minStops: Plan, params, error?: string }}
 */
export function optimizeTrip({ distanceMi, stations, vehicle, trip }) {
  const p = planParams(vehicle, trip);
  const sorted = stations.filter((s) => s.mile > 0.2 && s.mile < distanceMi - 0.2).sort((a, b) => a.mile - b.mile);
  const ctx = { ...p, L: distanceMi, stations: sorted };

  const direct = p.startGal - distanceMi / p.mpg;
  if (direct >= p.reserveGal - 1e-9) {
    const none = finalize(ctx, [], 'none');
    return { params: p, maxSavings: none, minStops: none, noStopsNeeded: true };
  }

  const gap = findGap(ctx);
  if (gap) return { params: p, error: gap };

  const maxSavings = dpPlan(ctx, EXTRA_STOP_THRESHOLD);
  const windowed = windowPlan(ctx);
  const fewest = dpPlan(ctx, 1000);
  let minStops = windowed;
  if (!windowed || (fewest && windowed.stops.length > fewest.stops.length)) minStops = fewest;
  if (!maxSavings || !minStops) return { params: p, error: 'No fuel plan fits these settings. Try a larger detour allowance or a smaller safety buffer.' };
  return {
    params: p,
    maxSavings: finalize(ctx, maxSavings.stops, 'maxSavings'),
    minStops: finalize(ctx, minStops.stops, 'minStops', windowed === minStops ? 'window' : 'dp'),
  };
}

/** Floor for fuel level at a pump or the destination. If the trip starts below the buffer, allow a lower floor until the first stop. */
function floorFor(ctx, hasStopped) {
  if (hasStopped || ctx.startGal >= ctx.reserveGal) return ctx.reserveGal;
  return Math.min(ctx.reserveGal, Math.max(0, ctx.tank * 0.03));
}

/** Detect a stretch of road no tank can cover between stations. */
function findGap(ctx) {
  const { stations, L, mpg, tank, reserveGal, startGal } = ctx;
  const usableMi = (tank - reserveGal) * mpg;
  const first = stations[0];
  const startReach = (startGal - floorFor(ctx, false)) * mpg;
  if (!first || first.mile + first.detourMi > startReach) {
    if (L > startReach) {
      return first
        ? `The first station within your detour limit is at mile ${first.mile.toFixed(0)}, but your starting fuel only reaches about mile ${Math.max(0, startReach).toFixed(0)} with the safety buffer. Start with more fuel or widen the detour limit.`
        : 'No stations with prices were found within your detour limit along this route. Widen the detour limit or check the station provider.';
    }
  }
  for (let i = 0; i < stations.length; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    const nextMile = b ? b.mile : L;
    const need = a.detourMi + (nextMile - a.mile) + (b ? b.detourMi : 0);
    if (need > usableMi) {
      return `There's a ${(nextMile - a.mile).toFixed(0)}-mile stretch after mile ${a.mile.toFixed(0)} (${a.address || a.name}) with no station inside your detour limit, and your usable range is ${usableMi.toFixed(0)} miles. Widen the detour limit or lower the safety buffer.`;
    }
  }
  return null;
}

// ---------- Dynamic program ----------
export function dpPlan(ctx, stopPenalty) {
  const { stations, L, mpg, tank, startGal } = ctx;
  const K = Math.min(160, Math.max(40, Math.ceil(tank / 0.2)));
  const unit = tank / K;
  const toUnitsCeil = (gal) => Math.ceil(gal / unit - 1e-9);
  // One extra unit of floor absorbs rounding in the burn model.
  const lowStart = startGal < ctx.reserveGal;
  const floorU = [Math.ceil(floorFor(ctx, false) / unit - 1e-9) + (lowStart ? 0 : 1), Math.ceil(floorFor(ctx, true) / unit - 1e-9) + 1];
  const minBuyU = Math.ceil(MIN_PURCHASE_GAL / unit);
  const N = stations.length;
  const INF = Infinity;
  const S = 2 * (K + 1);
  const idx = (s, lvl) => s * (K + 1) + lvl;

  // cur = fuel level on the route (not at a pump) at the current station's mile
  let cur = new Float64Array(S).fill(INF);
  const startU = Math.min(K, Math.floor(startGal / unit + 1e-9));
  // Burn along the route is measured from cumulative mileage so per-leg rounding can't accumulate.
  const burnU = (mile) => Math.round(mile / mpg / unit);
  const firstNeed = burnU(N ? stations[0].mile : L);
  if (startU - firstNeed < 0) return null;
  cur[idx(0, startU - firstNeed)] = 0;
  const back = []; // back[i][stateAfter] = { prev, buyU, stopped }

  for (let i = 0; i < N; i++) {
    const st = stations[i];
    const dU = toUnitsCeil(st.detourMi / mpg);
    const next = new Float64Array(S).fill(INF);
    const bk = new Array(S);
    for (let s = 0; s < 2; s++) {
      for (let a = 0; a <= K; a++) {
        const c = cur[idx(s, a)];
        if (c === INF) continue;
        // Pass the station.
        const passKey = idx(s, a);
        if (c < next[passKey]) {
          next[passKey] = c;
          bk[passKey] = { prev: idx(s, a), buyU: 0, stopped: false };
        }
        // Stop: drive the detour, buy, drive back.
        const atPump = a - dU;
        if (atPump < floorU[s]) continue;
        for (let q = Math.max(atPump + minBuyU, 0); q <= K; q++) {
          const dep = q - dU;
          if (dep < floorU[1]) continue;
          const cost = c + (q - atPump) * unit * st.price + stopPenalty;
          const key = idx(1, dep);
          if (cost < next[key]) {
            next[key] = cost;
            bk[key] = { prev: idx(s, a), buyU: q - atPump, stopped: true, arriveU: atPump };
          }
        }
      }
    }
    // Drive to the next station (or the destination).
    const nextMile = i + 1 < N ? stations[i + 1].mile : L;
    const legU = burnU(nextMile) - burnU(st.mile);
    const moved = new Float64Array(S).fill(INF);
    const mb = new Array(S);
    for (let s = 0; s < 2; s++) {
      for (let lvl = 0; lvl <= K; lvl++) {
        const c = next[idx(s, lvl)];
        if (c === INF) continue;
        const arrive = lvl - legU;
        if (arrive < (i + 1 < N ? 0 : floorU[s])) continue;
        const key = idx(s, arrive);
        if (c < moved[key]) {
          moved[key] = c;
          mb[key] = idx(s, lvl);
        }
      }
    }
    back.push({ bk, mb });
    cur = moved;
  }

  // Best end state.
  let best = INF;
  let bestKey = -1;
  for (let key = 0; key < S; key++) if (cur[key] < best) {
    best = cur[key];
    bestKey = key;
  }
  if (bestKey < 0) return null;

  // Reconstruct.
  const stops = [];
  let key = bestKey;
  for (let i = N - 1; i >= 0; i--) {
    const { bk, mb } = back[i];
    const afterDecision = mb[key];
    const d = bk[afterDecision];
    if (d.stopped) stops.unshift({ station: stations[i], gallons: d.buyU * unit });
    key = d.prev;
  }
  return { stops: refineGallons(ctx, stops), cost: best };
}

/** Replace unit-rounded purchase amounts with exact gallons, trimming the last stop to just what the destination needs. */
function refineGallons(ctx, stops) {
  const { mpg, tank, reserveGal, startGal, L } = ctx;
  let fuel = startGal;
  let mile = 0;
  const out = [];
  for (let i = 0; i < stops.length; i++) {
    const { station } = stops[i];
    fuel -= (station.mile - mile + station.detourMi) / mpg;
    const nextStop = stops[i + 1]?.station;
    let need;
    if (!nextStop) need = (station.detourMi + (L - station.mile)) / mpg + reserveGal;
    else need = (station.detourMi + (nextStop.mile - station.mile) + nextStop.detourMi) / mpg + reserveGal;
    // Keep DP's choice when it bought more (cheaper here than ahead), but never less than needed.
    const target = Math.min(tank, Math.max(fuel + stops[i].gallons, need + 0.05));
    const gallons = Math.min(Math.max(MIN_PURCHASE_GAL, target - fuel), tank - fuel);
    out.push({ station, gallons });
    fuel = fuel + gallons - station.detourMi / mpg;
    mile = station.mile;
  }
  return out;
}

// ---------- Refueling window (Minimum Stops + Low Cost) ----------
function windowPlan(ctx) {
  const { stations, L, mpg, tank, reserveGal, buffer, startGal } = ctx;
  const stops = [];
  let fuel = startGal;
  let mile = 0;
  let hasStopped = false;
  for (let guard = 0; guard < 200; guard++) {
    if (fuel - (L - mile) / mpg >= reserveGal - 1e-9) return { stops };
    const floor = floorFor(ctx, hasStopped);
    const reach = stations.filter((s) => s.mile > mile + 0.1 && fuel - (s.mile - mile + s.detourMi) / mpg >= floor - 1e-9);
    if (!reach.length) return null;
    const windowTopPct = Math.max(buffer + 0.1, 0.25);
    const arrivalPct = (s) => (fuel - (s.mile - mile + s.detourMi) / mpg) / tank;
    let candidates = reach.filter((s) => arrivalPct(s) <= windowTopPct);
    if (!candidates.length) candidates = [reach[reach.length - 1]];
    const trueCost = (s) => {
      const atPump = fuel - (s.mile - mile + s.detourMi) / mpg;
      const fillGal = gallonsAt(ctx, s, atPump);
      return fillGal * s.price + ((2 * s.detourMi) / mpg) * s.price;
    };
    // Rank by cost per gallon actually delivered to the trip (fill + detour penalty).
    const best = candidates.reduce((b, s) => {
      const atPumpS = fuel - (s.mile - mile + s.detourMi) / mpg;
      const atPumpB = fuel - (b.mile - mile + b.detourMi) / mpg;
      const perS = trueCost(s) / Math.max(1, gallonsAt(ctx, s, atPumpS));
      const perB = trueCost(b) / Math.max(1, gallonsAt(ctx, b, atPumpB));
      return perS < perB ? s : b;
    });
    const atPump = fuel - (best.mile - mile + best.detourMi) / mpg;
    const gallons = gallonsAt(ctx, best, atPump);
    stops.push({ station: best, gallons });
    fuel = atPump + gallons - best.detourMi / mpg;
    mile = best.mile;
    hasStopped = true;
  }
  return null;

  function gallonsAt(c, s, atPump) {
    const toDest = (s.detourMi + (L - s.mile)) / mpg + reserveGal + 0.05;
    const target = toDest <= tank ? toDest : tank;
    return Math.max(Math.min(MIN_PURCHASE_GAL, tank - atPump), target - atPump);
  }
}

// ---------- Build the itinerary ----------
function finalize(ctx, stops, kind, method) {
  const { mpg, tank, startGal, L } = ctx;
  let fuel = startGal;
  let mile = 0;
  const legs = [];
  let cost = 0;
  let gallons = 0;
  let detourMiles = 0;
  const profile = [{ mile: 0, pct: (startGal / tank) * 100 }];
  for (const [i, s] of stops.entries()) {
    const st = s.station;
    const atExit = fuel - (st.mile - mile) / mpg;
    const atPump = atExit - st.detourMi / mpg;
    const g = s.gallons;
    const depPump = atPump + g;
    const stopCost = g * st.price;
    const detourCost = ((2 * st.detourMi) / mpg) * st.price;
    legs.push({
      n: i + 1,
      station: st,
      mile: st.mile,
      arrivalPct: (atPump / tank) * 100,
      departurePct: (depPump / tank) * 100,
      gallons: g,
      cost: stopCost,
      detourCost,
      milesFromPrev: st.mile - mile,
      savingsVsArea: st.areaAvg != null ? (st.areaAvg - st.price) * g : 0,
    });
    profile.push({ mile: st.mile, pct: (atPump / tank) * 100 });
    profile.push({ mile: st.mile, pct: (depPump / tank) * 100 });
    cost += stopCost;
    gallons += g;
    detourMiles += 2 * st.detourMi;
    fuel = depPump - st.detourMi / mpg;
    mile = st.mile;
  }
  const endGal = fuel - (L - mile) / mpg;
  profile.push({ mile: L, pct: (endGal / tank) * 100 });
  return {
    kind,
    method,
    stops: legs,
    totalCost: cost,
    gallonsPurchased: gallons,
    gallonsBurned: (L + detourMiles) / mpg,
    detourMiles,
    endPct: (endGal / tank) * 100,
    profile,
  };
}

/** Savings of a plan versus paying the corridor's average price for the same gallons. */
export function savingsVsAverage(plan, routeAvg) {
  if (!plan || routeAvg == null) return 0;
  return plan.gallonsPurchased * routeAvg - plan.totalCost;
}
