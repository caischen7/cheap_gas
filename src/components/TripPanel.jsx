import { ArrowDownUp, Fuel, Gauge, Navigation, Route, ShieldCheck } from 'lucide-react';
import PlaceInput from './PlaceInput.jsx';
import { Section, Slider } from './ui.jsx';

export default function TripPanel({ api, origin, destination, setOrigin, setDestination, trip, setTrip, vehicle }) {
  const set = (patch) => setTrip((t) => ({ ...t, ...patch }));
  const effMpg = vehicle.ready ? vehicle.highwayMpg * (1 - trip.mpgMarginPct / 100) : null;
  const bufferMi = vehicle.ready ? vehicle.tankGallons * (trip.safetyBufferPct / 100) * effMpg : null;
  const startMi = vehicle.ready ? vehicle.tankGallons * (trip.startFuelPct / 100) * effMpg : null;
  const geocode = (q) => api.geocode(q, origin);

  return (
    <>
      <Section title="Route" icon={Route}>
        <div className="flex flex-col gap-2">
          <PlaceInput id="trip-origin" label="Starting location" value={origin} onSelect={setOrigin} geocode={geocode} accent="rgb(var(--good))" />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setOrigin(destination);
                setDestination(origin);
              }}
              className="-my-1 flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium text-muted hover:bg-sunk hover:text-ink"
            >
              <ArrowDownUp size={13} aria-hidden /> Swap
            </button>
          </div>
          <PlaceInput id="trip-destination" label="Destination" value={destination} onSelect={setDestination} geocode={geocode} accent="rgb(var(--bad))" />
          {api.mode === 'demo' && <p className="text-xs text-muted">Demo Mode covers 47 metro areas on the Interstate network. Switch to Live API Mode for any U.S. address.</p>}
        </div>
      </Section>

      <Section title="Fuel plan" icon={Fuel}>
        <Slider
          id="trip-start-fuel"
          label="Starting fuel level"
          value={trip.startFuelPct}
          min={10}
          max={100}
          step={5}
          format={(v) => `${v}%`}
          onChange={(startFuelPct) => set({ startFuelPct })}
          hint={startMi != null ? `About ${Math.round(startMi)} miles in the tank at departure.` : null}
        />
        <Slider
          id="trip-buffer"
          label="Safety buffer"
          value={trip.safetyBufferPct}
          min={5}
          max={35}
          step={1}
          format={(v) => `${v}%${bufferMi != null ? ` · ~${Math.round(bufferMi)} mi` : ''}`}
          onChange={(safetyBufferPct) => set({ safetyBufferPct })}
          hint="The plan never lets the tank drop below this before a stop or at your destination."
        />
        <Slider
          id="trip-mpg-margin"
          label="Real-world MPG margin"
          value={trip.mpgMarginPct}
          min={0}
          max={30}
          step={1}
          format={(v) => `−${v}%${effMpg != null ? ` · ${effMpg.toFixed(1)} mpg` : ''}`}
          onChange={(mpgMarginPct) => set({ mpgMarginPct })}
          hint="Plans with MPG this much below the rating, to cover heavy loads, roof boxes, towing, headwinds, mountain grades, A/C and 75+ mph cruising."
        />
        <Slider
          id="trip-detour"
          label="Max off-highway detour"
          value={trip.maxDetourMi}
          min={0.5}
          max={5}
          step={0.5}
          format={(v) => `${v} mi`}
          onChange={(maxDetourMi) => set({ maxDetourMi })}
          hint="One way, from the highway to the pump. The detour's fuel cost is counted in every station's true price."
        />
      </Section>

      {vehicle.ready && effMpg && (
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-line bg-panel p-3 text-center">
          <Mini icon={Gauge} label="Max range" value={`${Math.round(vehicle.tankGallons * effMpg)} mi`} />
          <Mini icon={ShieldCheck} label="Usable" value={`${Math.round(vehicle.tankGallons * effMpg * (1 - trip.safetyBufferPct / 100))} mi`} />
          <Mini icon={Navigation} label="Planning MPG" value={effMpg.toFixed(1)} />
        </div>
      )}
    </>
  );
}

function Mini({ icon: Icon, label, value }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon size={14} className="text-muted" aria-hidden />
      <span className="tabular font-display text-lg font-semibold leading-tight">{value}</span>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}
