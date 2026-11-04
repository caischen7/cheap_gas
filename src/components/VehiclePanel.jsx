import { useEffect, useState } from 'react';
import { AlertTriangle, Car, CheckCircle2, Loader2, Search, SlidersHorizontal } from 'lucide-react';
import { Field, NumberInput, Section, Segmented, Select } from './ui.jsx';

export const FUEL_GRADES = [
  { value: 'regular', label: 'Regular' },
  { value: 'midgrade', label: 'Midgrade' },
  { value: 'premium', label: 'Premium' },
  { value: 'diesel', label: 'Diesel' },
];

/** Resolve the panel's form state into the spec the optimizer needs. */
export function resolveVehicle(form) {
  if (form.mode === 'manual') {
    const { tank, mpg, fuel } = form.manual;
    const ready = tank > 0 && mpg > 0;
    return { ready, tankGallons: tank, highwayMpg: mpg, fuelType: fuel, label: 'Manual entry', reason: ready ? null : 'Enter tank size and highway MPG.' };
  }
  const d = form.details;
  if (!d) return { ready: false, reason: 'Pick a year, make, model and trim.' };
  if (d.unsupported) return { ready: false, reason: d.unsupported };
  const tank = d.tankGallons ?? (form.tankConfirmed ? form.tankInput : null);
  const fuelType = form.fuelOverride || d.fuelType;
  return {
    ready: !!tank && !!d.highwayMpg,
    tankGallons: tank,
    highwayMpg: d.highwayMpg,
    fuelType,
    label: `${d.year} ${d.make} ${d.model}`,
    reason: !tank ? 'Confirm the tank size for this trim.' : null,
  };
}

function useList(loader, deps, enabled) {
  const [state, setState] = useState({ items: [], loading: false, error: '' });
  useEffect(() => {
    if (!enabled) {
      setState({ items: [], loading: false, error: '' });
      return undefined;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: '' }));
    loader()
      .then((items) => live && setState({ items, loading: false, error: '' }))
      .catch((e) => live && setState({ items: [], loading: false, error: e.message }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}

export default function VehiclePanel({ api, form, setForm }) {
  const v = api.vehicles;
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const years = useList(() => v.years(), [api], form.mode === 'lookup');
  const makes = useList(() => v.makes(form.year), [api, form.year], form.mode === 'lookup' && !!form.year);
  const models = useList(() => v.models(form.year, form.make), [api, form.year, form.make], form.mode === 'lookup' && !!form.make);
  const trims = useList(() => v.options(form.year, form.make, form.model), [api, form.year, form.make, form.model], form.mode === 'lookup' && !!form.model);
  const [detailState, setDetailState] = useState({ loading: false, error: '' });

  useEffect(() => {
    if (form.mode !== 'lookup' || !form.optionId) return undefined;
    if (form.details?.id === form.optionId) return undefined;
    let live = true;
    setDetailState({ loading: true, error: '' });
    v.details(form.optionId, Number(form.year))
      .then((d) => {
        if (!live) return;
        setDetailState({ loading: false, error: '' });
        set({ details: d, tankConfirmed: false, tankInput: d?.tankGallons ?? d?.tankEstimate ?? 15, fuelOverride: '' });
      })
      .catch((e) => live && setDetailState({ loading: false, error: e.message }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.optionId, form.mode, api]);

  const d = form.details;
  const opt = (arr) => arr.map((x) => (typeof x === 'object' ? { value: x.value, label: x.text } : { value: String(x), label: String(x) }));
  const listError = years.error || makes.error || models.error || trims.error || detailState.error;

  return (
    <Section title="Vehicle" icon={Car}>
      <Segmented
        label="Vehicle input mode"
        value={form.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: 'lookup', label: 'EPA lookup', icon: Search },
          { value: 'manual', label: 'Manual entry', icon: SlidersHorizontal },
        ]}
      />

      {form.mode === 'lookup' ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Year" htmlFor="veh-year">
              <Select id="veh-year" value={form.year} placeholder={years.loading ? 'Loading…' : 'Year'} options={opt(years.items)} onChange={(year) => set({ year, make: '', model: '', optionId: '', details: null })} />
            </Field>
            <Field label="Make" htmlFor="veh-make">
              <Select id="veh-make" value={form.make} disabled={!form.year} placeholder={makes.loading ? 'Loading…' : 'Make'} options={opt(makes.items)} onChange={(make) => set({ make, model: '', optionId: '', details: null })} />
            </Field>
            <Field label="Model" htmlFor="veh-model">
              <Select id="veh-model" value={form.model} disabled={!form.make} placeholder={models.loading ? 'Loading…' : 'Model'} options={opt(models.items)} onChange={(model) => set({ model, optionId: '', details: null })} />
            </Field>
            <Field label="Trim" htmlFor="veh-trim">
              <Select id="veh-trim" value={form.optionId} disabled={!form.model} placeholder={trims.loading ? 'Loading…' : 'Trim'} options={opt(trims.items)} onChange={(optionId) => set({ optionId, details: null })} />
            </Field>
          </div>
          {listError && <p className="rounded-md bg-bad/10 px-3 py-2 text-xs text-bad">{listError} Manual entry still works without the EPA lookup.</p>}
          {detailState.loading && (
            <p className="flex items-center gap-2 text-xs text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading EPA specs…
            </p>
          )}
          {d && (
            <div className="rounded-lg border border-line bg-sunk/60 p-3">
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Spec label="Hwy MPG" value={d.highwayMpg ?? '—'} />
                <Spec label="Fuel" value={FUEL_GRADES.find((g) => g.value === d.fuelType)?.label ?? d.fuelLabel ?? '—'} />
                <Spec label="Tank" value={d.tankGallons ? `${d.tankGallons} gal` : form.tankConfirmed ? `${form.tankInput} gal` : '?'} />
              </dl>
              {d.vehicleClass && <p className="mt-2 text-center text-[11px] text-muted">{d.vehicleClass} · {d.source === 'epa' ? 'EPA fueleconomy.gov' : 'Demo catalog'}</p>}
              {!d.tankGallons && !d.unsupported && (
                <div className={`mt-3 flex flex-col gap-2 rounded-md p-2.5 ${form.tankConfirmed ? 'bg-good/10' : 'bg-amber/15'}`}>
                  <p className="flex items-start gap-2 text-xs">
                    {form.tankConfirmed ? <CheckCircle2 size={14} className="mt-px shrink-0 text-good" /> : <AlertTriangle size={14} className="mt-px shrink-0 text-amber" />}
                    {form.tankConfirmed
                      ? 'Tank size confirmed.'
                      : `The EPA record doesn't include tank capacity. We pre-filled a typical size for a ${d.vehicleClass || 'vehicle like this'}; check your owner's manual and confirm.`}
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <NumberInput id="veh-tank-confirm" value={form.tankInput} min={5} max={60} step={0.1} suffix="gal" onChange={(tankInput) => set({ tankInput, tankConfirmed: false })} />
                    </div>
                    <button
                      type="button"
                      disabled={!(form.tankInput > 0)}
                      onClick={() => set({ tankConfirmed: true })}
                      className="rounded-md bg-sign px-3 py-2 text-sm font-semibold text-sign-ink disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              )}
              {d.unsupported && <p className="mt-2 text-xs text-bad">{d.unsupported}</p>}
              {!d.unsupported && (
                <div className="mt-3">
                  <Field label="Fuel grade you'll buy" htmlFor="veh-grade">
                    <Select id="veh-grade" value={form.fuelOverride || d.fuelType} placeholder="EPA recommended" options={FUEL_GRADES} onChange={(fuelOverride) => set({ fuelOverride })} />
                  </Field>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tank volume" htmlFor="man-tank">
            <NumberInput id="man-tank" value={form.manual.tank} min={5} max={60} step={0.1} suffix="gal" onChange={(tank) => set({ manual: { ...form.manual, tank } })} />
          </Field>
          <Field label="Highway MPG" htmlFor="man-mpg">
            <NumberInput id="man-mpg" value={form.manual.mpg} min={5} max={80} step={0.5} suffix="mpg" onChange={(mpg) => set({ manual: { ...form.manual, mpg } })} />
          </Field>
          <div className="col-span-2">
            <Field label="Fuel grade" htmlFor="man-grade">
              <Select id="man-grade" value={form.manual.fuel} placeholder="Choose grade" options={FUEL_GRADES} onChange={(fuel) => set({ manual: { ...form.manual, fuel: fuel || 'regular' } })} />
            </Field>
          </div>
        </div>
      )}
    </Section>
  );
}

function Spec({ label, value }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="tabular font-display text-xl font-semibold leading-tight">{value}</dd>
    </div>
  );
}
