import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FlaskConical, Fuel, Info, Loader2, Play, Radio, Settings } from 'lucide-react';
import { createApiService, loadSettings, saveSettings } from './services/apiService.js';
import { optimizeTrip } from './lib/optimizer.js';
import VehiclePanel, { resolveVehicle } from './components/VehiclePanel.jsx';
import TripPanel from './components/TripPanel.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import MapView from './components/MapView.jsx';
import { FuelProfile, Itinerary, StrategyCards, SummaryBanner } from './components/Results.jsx';
import { HUBS } from './data/interstates.js';

const hub = (id) => ({ label: HUBS[id][0], lat: HUBS[id][1], lng: HUBS[id][2], hubId: id });

const DEMO_VEHICLE = { mode: 'lookup', year: '2024', make: 'Toyota', model: 'RAV4', optionId: 'Toyota|RAV4|LE FWD', details: null, tankInput: null, tankConfirmed: false, fuelOverride: '' };
const EMPTY_LOOKUP = { year: '', make: '', model: '', optionId: '', details: null, tankInput: null, tankConfirmed: false, fuelOverride: '' };
const DEFAULT_TRIP = { startFuelPct: 100, safetyBufferPct: 15, mpgMarginPct: 10, maxDetourMi: 2 };
const DEMO_FETCH_DETOUR = 5;

export default function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [storageOk, setStorageOk] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const api = useMemo(() => createApiService(settings), [settings]);

  const [vehicleForm, setVehicleForm] = useState({ ...DEMO_VEHICLE, manual: { tank: 14.5, mpg: 35, fuel: 'regular' } });
  const [origin, setOrigin] = useState(hub('LAX'));
  const [destination, setDestination] = useState(hub('DFW'));
  const [trip, setTrip] = useState(DEFAULT_TRIP);
  const [fetched, setFetched] = useState(null);
  const [status, setStatus] = useState({ phase: 'idle', progress: 0, error: '' });
  const [strategy, setStrategy] = useState('maxSavings');
  const [selectedStop, setSelectedStop] = useState(null);
  const runId = useRef(0);

  const vehicle = resolveVehicle(vehicleForm);
  const grade = vehicle.fuelType || 'regular';

  // Switching data modes resets mode-specific inputs.
  const prevMode = useRef(settings.mode);
  useEffect(() => {
    if (prevMode.current === settings.mode) return;
    prevMode.current = settings.mode;
    setFetched(null);
    setStatus({ phase: 'idle', progress: 0, error: '' });
    if (settings.mode === 'demo') {
      setVehicleForm((f) => ({ ...f, ...DEMO_VEHICLE, mode: f.mode }));
      setOrigin(hub('LAX'));
      setDestination(hub('DFW'));
    } else {
      setVehicleForm((f) => ({ ...f, ...EMPTY_LOOKUP }));
    }
  }, [settings.mode]);

  const plan = useCallback(async () => {
    if (!origin || !destination) return setStatus({ phase: 'error', progress: 0, error: 'Choose a starting location and a destination.' });
    if (!vehicle.ready) return setStatus({ phase: 'error', progress: 0, error: vehicle.reason || 'Finish the vehicle details.' });
    const my = ++runId.current;
    setSelectedStop(null);
    try {
      setStatus({ phase: 'routing', progress: 0, error: '' });
      const route = await api.route(origin, destination);
      if (my !== runId.current) return;
      setStatus({ phase: 'stations', progress: 0, error: '' });
      const detour = api.mode === 'demo' ? DEMO_FETCH_DETOUR : trip.maxDetourMi;
      const result = await api.findStations(route, {
        grade,
        maxDetourMi: detour,
        sampleSpacingMi: settings.sampleSpacingMi,
        onProgress: (p) => my === runId.current && setStatus((s) => ({ ...s, progress: p })),
      });
      if (my !== runId.current) return;
      setFetched({ route, result, grade, detour, origin, destination, mode: api.mode });
      setStatus({ phase: 'done', progress: 1, error: '' });
    } catch (e) {
      if (my === runId.current) setStatus({ phase: 'error', progress: 0, error: e.message || String(e) });
    }
  }, [api, origin, destination, vehicle.ready, vehicle.reason, grade, trip.maxDetourMi, settings.sampleSpacingMi]);

  // Demo Mode re-plans automatically; Live Mode waits for the button (API calls cost quota).
  const autoKey = `${api.mode}|${origin?.label}|${destination?.label}|${grade}|${vehicle.ready}`;
  useEffect(() => {
    if (api.mode === 'demo' && vehicle.ready && origin && destination) plan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoKey]);

  const stale =
    fetched &&
    (fetched.grade !== grade || fetched.origin?.label !== origin?.label || fetched.destination?.label !== destination?.label || trip.maxDetourMi > fetched.detour + 1e-9);

  const optimized = useMemo(() => {
    if (!fetched || !vehicle.ready) return null;
    const stations = fetched.result.stations.filter((s) => s.detourMi <= trip.maxDetourMi + 1e-9);
    return { stations, ...optimizeTrip({ distanceMi: fetched.route.distanceMi, stations, vehicle, trip }) };
  }, [fetched, vehicle.ready, vehicle.tankGallons, vehicle.highwayMpg, trip]); // eslint-disable-line react-hooks/exhaustive-deps

  const activePlan = optimized && !optimized.error ? optimized[strategy] : null;
  const busy = status.phase === 'routing' || status.phase === 'stations';

  const saveAndClose = (next) => {
    setSettings(next);
    setStorageOk(saveSettings(next));
    setSettingsOpen(false);
  };

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-[env(safe-area-inset-top,0px)] z-[1100] bg-sign text-sign-ink">
        <div className="gutter mx-auto flex max-w-[1500px] items-center justify-between gap-3 py-2.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden h-9 w-9 shrink-0 place-items-center rounded-md border-2 border-sign-ink/80 sm:grid" aria-hidden>
              <Fuel size={19} />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg font-bold sm:text-[22px] uppercase leading-none tracking-[0.04em]">RoadTrip Fuel Optimizer</h1>
              <p className="hidden truncate text-[11px] opacity-80 sm:block">Cheapest fuel, fewest stops, on any Interstate drive</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex rounded-md bg-black/20 p-0.5" role="radiogroup" aria-label="Data mode">
              {[
                { v: 'demo', label: 'Demo', icon: FlaskConical },
                { v: 'live', label: 'Live API', icon: Radio },
              ].map((m) => (
                <button
                  key={m.v}
                  type="button"
                  role="radio"
                  aria-checked={settings.mode === m.v}
                  onClick={() => saveAndClose({ ...settings, mode: m.v })}
                  className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${settings.mode === m.v ? 'bg-panel text-ink' : 'text-sign-ink/85 hover:text-sign-ink'}`}
                >
                  <m.icon size={13} aria-hidden /> {m.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setSettingsOpen(true)} aria-label="Data sources and API keys" className="rounded-md p-2 hover:bg-black/15">
              <Settings size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="gutter mx-auto grid w-full max-w-[1500px] flex-1 gap-5 py-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="flex min-w-0 flex-col gap-6 lg:sticky lg:top-[calc(env(safe-area-inset-top,0px)+72px)] lg:max-h-[calc(100vh-92px)] lg:self-start lg:overflow-y-auto lg:pr-1">
          <VehiclePanel api={api} form={vehicleForm} setForm={setVehicleForm} />
          <TripPanel api={api} origin={origin} destination={destination} setOrigin={setOrigin} setDestination={setDestination} trip={trip} setTrip={setTrip} vehicle={vehicle} />
          <div className="flex flex-col gap-2 pb-2">
            <button
              type="button"
              onClick={plan}
              disabled={busy}
              className="flex items-center justify-center gap-2 rounded-lg bg-sign px-4 py-3 font-display text-lg font-semibold uppercase tracking-[0.06em] text-sign-ink shadow-sm disabled:opacity-60"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
              {busy ? 'Planning…' : stale ? 'Re-plan trip' : 'Plan fuel stops'}
            </button>
            {!vehicle.ready && <p className="text-xs text-muted">{vehicle.reason}</p>}
            {stale && !busy && <p className="text-xs text-amber">Inputs changed since the last search. Re-plan to fetch stations for the new route, grade or detour.</p>}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col gap-4" aria-live="polite">
          {status.phase === 'error' && (
            <div className="flex items-start gap-2 rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" /> <span>{status.error}</span>
            </div>
          )}
          {optimized?.error && (
            <div className="flex items-start gap-2 rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bad" /> <span>{optimized.error}</span>
            </div>
          )}

          {fetched && activePlan && <SummaryBanner route={fetched.route} plan={activePlan} routeAvg={fetched.result.routeAvg} />}

          <div className="relative h-[380px] overflow-hidden rounded-xl border border-line sm:h-[460px]">
            <MapView
              route={fetched?.route}
              stations={optimized?.stations}
              plan={activePlan}
              origin={origin}
              destination={destination}
              selectedStop={selectedStop}
              onSelectStop={setSelectedStop}
              showTiles={settings.mode === 'live' && settings.streetTiles}
            />
            {busy && (
              <div className="absolute inset-x-3 top-3 z-[500] flex flex-col gap-1.5 rounded-lg bg-panel/95 px-3 py-2 shadow">
                <span className="flex items-center gap-2 text-xs font-medium">
                  <Loader2 size={13} className="animate-spin" />
                  {status.phase === 'routing' ? 'Routing…' : `Searching the corridor every ${settings.sampleSpacingMi} mi for ${grade} prices… ${Math.round(status.progress * 100)}%`}
                </span>
                <div className="h-1 overflow-hidden rounded bg-sunk">
                  <div className="h-full bg-sign transition-[width]" style={{ width: `${Math.max(4, status.progress * 100)}%` }} />
                </div>
              </div>
            )}
            {fetched && optimized && (
              <div className="pointer-events-none absolute bottom-2 left-2 z-[500] flex flex-wrap gap-x-3 gap-y-1 rounded-md bg-panel/90 px-2.5 py-1.5 text-[11px] shadow">
                <Legend cls="bg-good" label="Cheapest 20%" />
                <Legend cls="bg-muted" label="Typical" />
                <Legend cls="bg-bad" label="Priciest 20%" />
                <span className="text-muted">{optimized.stations.length} stations within {trip.maxDetourMi} mi</span>
              </div>
            )}
          </div>

          {optimized && optimized.noStopsNeeded && (
            <div className="flex items-start gap-2 rounded-lg border border-good/40 bg-good/10 px-4 py-3 text-sm">
              <Info size={16} className="mt-0.5 shrink-0 text-good" /> No fuel stop needed. You'll arrive with {Math.round(optimized.maxSavings.endPct)}% of the tank, above your {trip.safetyBufferPct}% buffer.
            </div>
          )}

          {optimized && !optimized.error && !optimized.noStopsNeeded && (
            <StrategyCards result={optimized} selected={strategy} onSelect={setStrategy} routeAvg={fetched.result.routeAvg} />
          )}

          {activePlan && fetched && (
            <>
              <FuelProfile plan={activePlan} distanceMi={fetched.route.distanceMi} bufferPct={trip.safetyBufferPct} selectedStop={selectedStop} onSelectStop={setSelectedStop} />
              <div className="flex flex-col gap-2">
                <h2 className="font-display text-[15px] font-semibold uppercase tracking-[0.08em] text-muted">Stop-by-stop itinerary</h2>
                <Itinerary plan={activePlan} route={fetched.route} origin={fetched.origin} destination={fetched.destination} selectedStop={selectedStop} onSelectStop={setSelectedStop} />
              </div>
            </>
          )}

          {fetched && (
            <footer className="flex flex-col gap-1 border-t border-line pt-3 text-xs text-muted">
              <p>
                Route: {fetched.route.provider}
                {fetched.route.highways?.length ? ` via ${[...new Set(fetched.route.highways.map((h) => h.hwy))].join(', ')}` : ''}. Searched {fetched.result.samplesQueried} corridor points, {fetched.result.allNearby.length} priced stations found.
              </p>
              {fetched.result.notes.map((n) => (
                <p key={n}>{n}</p>
              ))}
              <p>Fuel math uses {vehicle.highwayMpg} MPG rated, planned at {(vehicle.highwayMpg * (1 - trip.mpgMarginPct / 100)).toFixed(1)} MPG ({trip.mpgMarginPct}% real-world margin). Prices change; check the pump before you fill.</p>
            </footer>
          )}
        </section>
      </main>

      <SettingsModal open={settingsOpen} settings={settings} onSave={saveAndClose} onClose={() => setSettingsOpen(false)} storageOk={storageOk} />
    </div>
  );
}

function Legend({ cls, label }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-2 w-2 rounded-full ${cls}`} /> {label}
    </span>
  );
}
