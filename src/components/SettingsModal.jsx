import { useEffect, useRef, useState } from 'react';
import { KeyRound, X } from 'lucide-react';
import { DEFAULT_SETTINGS } from '../services/apiService.js';
import { Field, Segmented, Select, Slider, TextInput } from './ui.jsx';

export default function SettingsModal({ open, settings, onSave, onClose, storageOk }) {
  const [draft, setDraft] = useState(settings);
  const dialogRef = useRef(null);
  useEffect(() => {
    if (open) setDraft(settings);
  }, [open, settings]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const setCustom = (patch) => setDraft((d) => ({ ...d, custom: { ...d.custom, ...patch } }));

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-xl bg-panel shadow-2xl sm:rounded-xl"
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 id="settings-title" className="flex items-center gap-2 font-display text-xl font-semibold">
            <KeyRound size={18} aria-hidden /> Data sources & API keys
          </h2>
          <button type="button" onClick={onClose} aria-label="Close settings" className="rounded p-1 text-muted hover:bg-sunk hover:text-ink">
            <X size={18} />
          </button>
        </header>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
          <Segmented
            label="Data mode"
            value={draft.mode}
            onChange={(mode) => set({ mode })}
            options={[
              { value: 'demo', label: 'Realistic Demo Mode' },
              { value: 'live', label: 'Live API Mode' },
            ]}
          />
          {draft.mode === 'demo' ? (
            <p className="text-sm text-muted">
              Demo Mode routes over a built-in Interstate network and simulates stations and prices from state averages. Nothing leaves your browser.
            </p>
          ) : (
            <p className="rounded-md bg-amber/15 px-3 py-2 text-xs">
              Live API Mode calls outside services from your browser. The claude.ai artifact preview blocks outside requests, so run this app locally (<code>npm run dev</code>) or host it to use live data. Vehicle lookup uses the free EPA fueleconomy.gov API.
            </p>
          )}

          <fieldset className="flex flex-col gap-3" disabled={draft.mode === 'demo'}>
            <legend className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.08em] text-muted">Routing & addresses</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Routing engine" htmlFor="set-routing">
                <Select
                  id="set-routing"
                  value={draft.routingProvider}
                  placeholder="Choose"
                  onChange={(routingProvider) => set({ routingProvider: routingProvider || 'osrm' })}
                  options={[
                    { value: 'osrm', label: 'OSRM (no key)' },
                    { value: 'mapbox', label: 'Mapbox Directions' },
                  ]}
                />
              </Field>
              <Field label="Address autocomplete" htmlFor="set-geocoder">
                <Select
                  id="set-geocoder"
                  value={draft.geocoder}
                  placeholder="Choose"
                  onChange={(geocoder) => set({ geocoder: geocoder || 'photon' })}
                  options={[
                    { value: 'photon', label: 'Photon / OpenStreetMap (no key)' },
                    { value: 'mapbox', label: 'Mapbox Geocoding' },
                  ]}
                />
              </Field>
            </div>
            {draft.routingProvider === 'osrm' && (
              <Field label="OSRM server" htmlFor="set-osrm" hint="The public demo server is rate-limited; point this at your own OSRM for heavy use.">
                <TextInput id="set-osrm" value={draft.osrmUrl} onChange={(osrmUrl) => set({ osrmUrl })} />
              </Field>
            )}
            {(draft.routingProvider === 'mapbox' || draft.geocoder === 'mapbox') && (
              <Field label="Mapbox access token" htmlFor="set-mapbox">
                <TextInput id="set-mapbox" type="password" value={draft.mapboxToken} onChange={(mapboxToken) => set({ mapboxToken })} placeholder="pk.…" autoComplete="off" />
              </Field>
            )}
          </fieldset>

          <fieldset className="flex flex-col gap-3" disabled={draft.mode === 'demo'}>
            <legend className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.08em] text-muted">Station prices</legend>
            <Field label="Price provider" htmlFor="set-stations">
              <Select
                id="set-stations"
                value={draft.stationProvider}
                placeholder="Choose"
                onChange={(stationProvider) => set({ stationProvider: stationProvider || 'google' })}
                options={[
                  { value: 'google', label: 'Google Places API (New): station prices' },
                  { value: 'overpass', label: 'OpenStreetMap stations + CollectAPI state averages' },
                  { value: 'custom', label: 'Custom JSON endpoint (RapidAPI, etc.)' },
                ]}
              />
            </Field>
            {draft.stationProvider === 'google' && (
              <Field label="Google Maps Platform key" htmlFor="set-google" hint="Enable Places API (New). Each corridor sample is one Nearby Search request; a 1,000-mile trip at 20-mile spacing is about 50 requests.">
                <TextInput id="set-google" type="password" value={draft.googleKey} onChange={(googleKey) => set({ googleKey })} placeholder="AIza…" autoComplete="off" />
              </Field>
            )}
            {draft.stationProvider === 'overpass' && (
              <>
                <Field label="CollectAPI key" htmlFor="set-collect" hint="Gas Prices API → stateUsaPrice. Stations come from OpenStreetMap via Overpass.">
                  <TextInput id="set-collect" type="password" value={draft.collectApiKey} onChange={(collectApiKey) => set({ collectApiKey })} autoComplete="off" />
                </Field>
                <Field label="Overpass endpoint" htmlFor="set-overpass">
                  <TextInput id="set-overpass" value={draft.overpassUrl} onChange={(overpassUrl) => set({ overpassUrl })} />
                </Field>
              </>
            )}
            {draft.stationProvider === 'custom' && (
              <div className="flex flex-col gap-3 rounded-lg bg-sunk/60 p-3">
                <Field label="URL template" htmlFor="set-c-url" hint="Placeholders: {lat} {lng} {radius_mi} {radius_m} {grade}">
                  <TextInput id="set-c-url" value={draft.custom.url} onChange={(url) => setCustom({ url })} placeholder="https://example.p.rapidapi.com/stations?lat={lat}&lng={lng}&radius={radius_mi}" />
                </Field>
                <Field label="Headers (JSON)" htmlFor="set-c-headers">
                  <TextInput id="set-c-headers" value={draft.custom.headers} onChange={(headers) => setCustom({ headers })} placeholder='{"X-RapidAPI-Key":"…","X-RapidAPI-Host":"…"}' autoComplete="off" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['listPath', 'List path'],
                    ['idPath', 'ID path'],
                    ['namePath', 'Name path'],
                    ['brandPath', 'Brand path'],
                    ['addressPath', 'Address path'],
                    ['pricePath', 'Price path'],
                    ['latPath', 'Latitude path'],
                    ['lngPath', 'Longitude path'],
                  ].map(([k, label]) => (
                    <Field key={k} label={label} htmlFor={`set-c-${k}`}>
                      <TextInput id={`set-c-${k}`} value={draft.custom[k]} onChange={(val) => setCustom({ [k]: val })} />
                    </Field>
                  ))}
                </div>
              </div>
            )}
            <Slider
              id="set-spacing"
              label="Corridor sample spacing"
              value={draft.sampleSpacingMi}
              min={15}
              max={25}
              step={1}
              format={(v) => `every ${v} mi`}
              onChange={(sampleSpacingMi) => set({ sampleSpacingMi })}
              hint="Shorter spacing finds more stations but uses more API requests."
            />
          </fieldset>

          <fieldset className="flex flex-col gap-3" disabled={draft.mode === 'demo'}>
            <legend className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.08em] text-muted">Network</legend>
            <Field label="CORS proxy prefix (optional)" htmlFor="set-proxy" hint="Prepended to every request for APIs that don't allow browser calls, e.g. https://your-proxy.example.com/?url=">
              <TextInput id="set-proxy" value={draft.corsProxy} onChange={(corsProxy) => set({ corsProxy })} />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.streetTiles} onChange={(e) => set({ streetTiles: e.target.checked })} />
              Show OpenStreetMap street tiles under the route
            </label>
          </fieldset>

          <p className="text-xs text-muted">
            {storageOk ? 'Keys are saved in this browser only and are sent only to the provider they belong to.' : "This browser blocks local storage, so settings last until you close the page."}
          </p>
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-line px-5 py-3">
          <button type="button" onClick={() => setDraft({ ...DEFAULT_SETTINGS, mode: draft.mode })} className="text-sm text-muted hover:text-ink">
            Reset to defaults
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm font-medium hover:bg-sunk">
              Cancel
            </button>
            <button type="button" onClick={() => onSave(draft)} className="rounded-md bg-sign px-4 py-2 text-sm font-semibold text-sign-ink">
              Save settings
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
