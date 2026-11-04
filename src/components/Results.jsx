import { ArrowRight, BadgeDollarSign, Clock, Droplets, ExternalLink, Flag, Fuel, MapPin, PiggyBank, Route, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import { money, num, Price } from './ui.jsx';
import { savingsVsAverage } from '../lib/optimizer.js';

export function SummaryBanner({ route, plan, routeAvg }) {
  const savings = savingsVsAverage(plan, routeAvg);
  const hours = route.durationMin / 60;
  const items = [
    { icon: Route, label: 'Total distance', value: `${num(route.distanceMi)} mi`, sub: `${Math.floor(hours)} h ${Math.round((hours % 1) * 60)} m driving` },
    { icon: BadgeDollarSign, label: 'Est. fuel cost', value: money(plan.totalCost), sub: `${num(plan.gallonsPurchased, 1)} gal to buy` },
    { icon: Droplets, label: 'Gallons needed', value: num(plan.gallonsBurned, 1), sub: `incl. ${num(plan.detourMiles, 1)} detour mi` },
    { icon: Fuel, label: 'Stops', value: plan.stops.length, sub: `arrive with ${Math.round(plan.endPct)}% tank` },
    {
      icon: PiggyBank,
      label: 'Savings vs. avg',
      value: money(savings),
      sub: routeAvg ? `corridor avg $${routeAvg.toFixed(3)}/gal` : 'no average',
      tone: savings >= 0 ? 'text-good' : 'text-bad',
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3 xl:grid-cols-5">
      {items.map((it, i) => (
        <div key={it.label} className={`flex min-w-0 flex-col gap-0.5 bg-panel px-4 py-3 ${i === items.length - 1 ? 'col-span-2 sm:col-span-1' : ''}`}>
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            <it.icon size={13} aria-hidden /> {it.label}
          </span>
          <span className={`tabular font-display text-[28px] font-bold leading-tight ${it.tone || ''}`}>{it.value}</span>
          <span className="truncate text-xs text-muted">{it.sub}</span>
        </div>
      ))}
    </div>
  );
}

const STRATEGY_COPY = {
  maxSavings: {
    title: 'Maximum Savings',
    icon: PiggyBank,
    blurb: 'Lowest total dollars. Buys partial tanks at pricier stations when that gets you to cheaper fuel ahead.',
  },
  minStops: {
    title: 'Minimum Stops + Low Cost',
    icon: Zap,
    blurb: 'Drives into the last 15–25% of the tank, then fills at the cheapest station in that window.',
  },
};

export function StrategyCards({ result, selected, onSelect, routeAvg }) {
  const keys = ['maxSavings', 'minStops'];
  const other = (k) => result[k === 'maxSavings' ? 'minStops' : 'maxSavings'];
  return (
    <div role="radiogroup" aria-label="Strategy" className="grid gap-3 md:grid-cols-2">
      {keys.map((k) => {
        const plan = result[k];
        const copy = STRATEGY_COPY[k];
        const active = selected === k;
        const diffCost = plan.totalCost - other(k).totalCost;
        const diffStops = plan.stops.length - other(k).stops.length;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onSelect(k)}
            className={`flex min-w-0 flex-col gap-3 rounded-xl border-2 bg-panel p-4 text-left transition-colors ${active ? 'border-sign' : 'border-line hover:border-muted/60'}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`grid h-8 w-8 place-items-center rounded-md ${active ? 'bg-sign text-sign-ink' : 'bg-sunk text-muted'}`}>
                  <copy.icon size={17} aria-hidden />
                </span>
                <h3 className="font-display text-xl font-semibold leading-tight">{copy.title}</h3>
              </div>
              {active && <span className="rounded-full bg-sign/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-sign">On map</span>}
            </div>
            <p className="text-[13px] text-muted">{copy.blurb}</p>
            <dl className="grid grid-cols-3 gap-2">
              <Stat label="Fuel cost" value={money(plan.totalCost)} />
              <Stat label="Stops" value={plan.stops.length} />
              <Stat label="Saved vs avg" value={money(savingsVsAverage(plan, routeAvg))} />
            </dl>
            <p className="text-xs text-muted">
              {Math.abs(diffCost) < 0.01 && diffStops === 0
                ? 'Same result as the other strategy on this route.'
                : `${diffCost <= 0 ? `${money(-diffCost)} cheaper` : `${money(diffCost)} more`} and ${diffStops === 0 ? 'the same number of stops' : `${Math.abs(diffStops)} ${diffStops < 0 ? 'fewer' : 'more'} stop${Math.abs(diffStops) === 1 ? '' : 's'}`} than the other plan.`}
            </p>
          </button>
        );
      })}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="tabular truncate font-display text-xl font-semibold leading-tight">{value}</dd>
    </div>
  );
}

/** Tank level along the route, with the safety buffer as a reference line. */
export function FuelProfile({ plan, distanceMi, bufferPct, selectedStop, onSelectStop }) {
  const W = 800;
  const H = 190;
  const pad = { l: 40, r: 12, t: 30, b: 26 };
  const x = (m) => pad.l + (m / distanceMi) * (W - pad.l - pad.r);
  const y = (pct) => pad.t + (1 - pct / 100) * (H - pad.t - pad.b);
  const pts = plan.profile.map((p) => `${x(p.mile).toFixed(1)},${y(Math.max(0, p.pct)).toFixed(1)}`).join(' ');
  const area = `${x(0)},${y(0)} ${pts} ${x(distanceMi)},${y(0)}`;
  const step = distanceMi > 1500 ? 500 : distanceMi > 600 ? 200 : distanceMi > 250 ? 100 : 50;
  const ticks = [];
  for (let m = 0; m <= distanceMi; m += step) ticks.push(m);
  return (
    <figure className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-lg font-semibold">Tank level along the route</span>
        <span className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-sign" /> Fuel %
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-4 border-t-2 border-dashed border-bad" /> Buffer {bufferPct}%
          </span>
        </span>
      </figcaption>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[480px]" role="img" aria-label="Fuel level chart">
          {[0, 25, 50, 75, 100].map((p) => (
            <g key={p}>
              <line x1={pad.l} x2={W - pad.r} y1={y(p)} y2={y(p)} stroke="rgb(var(--line))" strokeWidth="1" />
              <text x={pad.l - 6} y={y(p) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--muted))" className="tabular">
                {p}%
              </text>
            </g>
          ))}
          {ticks.map((m) => (
            <text key={m} x={x(m)} y={H - 8} textAnchor="middle" fontSize="11" fill="rgb(var(--muted))" className="tabular">
              {m === 0 ? 'mi 0' : num(m)}
            </text>
          ))}
          <polygon points={area} fill="rgb(var(--sign) / 0.14)" />
          <polyline points={pts} fill="none" stroke="rgb(var(--sign))" strokeWidth="2.25" strokeLinejoin="round" />
          <line x1={pad.l} x2={W - pad.r} y1={y(bufferPct)} y2={y(bufferPct)} stroke="rgb(var(--bad))" strokeWidth="1.5" strokeDasharray="5 4" />
          {plan.stops.map((s) => (
            <g key={s.n} className="cursor-pointer" onClick={() => onSelectStop(s.n)}>
              <line x1={x(s.mile)} x2={x(s.mile)} y1={y(s.departurePct)} y2={y(0)} stroke="rgb(var(--sign) / 0.35)" strokeDasharray="2 3" />
              <rect x={x(s.mile) - 10} y={y(s.departurePct) - 24} width="20" height="18" rx="4" fill={selectedStop === s.n ? 'rgb(var(--amber))' : 'rgb(var(--sign))'} />
              <text x={x(s.mile)} y={y(s.departurePct) - 11} textAnchor="middle" fontSize="12" fontWeight="700" fill="rgb(var(--sign-ink))">
                {s.n}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </figure>
  );
}

export function Itinerary({ plan, route, origin, destination, selectedStop, onSelectStop }) {
  return (
    <ol className="flex flex-col gap-3">
      <EndCard kind="start" label={origin.label} detail={`Depart with ${Math.round(plan.profile[0].pct)}% tank`} />
      {plan.stops.map((stop) => (
        <StopCard key={stop.n} stop={stop} selected={selectedStop === stop.n} onSelect={() => onSelectStop(stop.n)} />
      ))}
      <EndCard kind="end" label={destination.label} detail={`Arrive at mile ${num(route.distanceMi)} with ${Math.round(plan.endPct)}% tank`} />
    </ol>
  );
}

function EndCard({ kind, label, detail }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${kind === 'start' ? 'bg-[rgb(22_128_61)]' : 'bg-[rgb(190_46_38)]'}`}>
        {kind === 'start' ? <MapPin size={16} aria-hidden /> : <Flag size={16} aria-hidden />}
      </span>
      <div className="min-w-0">
        <p className="truncate font-semibold">{label}</p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
    </li>
  );
}

function StopCard({ stop, selected, onSelect }) {
  const s = stop.station;
  const diff = s.areaAvg != null ? s.price - s.areaAvg : null;
  const gmaps = `https://www.google.com/maps/dir/?api=1&destination=${s.lat.toFixed(6)},${s.lng.toFixed(6)}&travelmode=driving`;
  const amaps = `https://maps.apple.com/?daddr=${s.lat.toFixed(6)},${s.lng.toFixed(6)}&dirflg=d`;
  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border-2 bg-panel p-4 transition-colors ${selected ? 'border-amber' : 'border-transparent shadow-sm ring-1 ring-line'}`}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-sign font-display text-lg font-bold text-sign-ink">{stop.n}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h3 className="font-display text-xl font-semibold leading-tight">{s.name}</h3>
            <span className="tabular whitespace-nowrap text-xs font-medium text-muted">
              Mile {num(stop.mile)} · +{num(stop.milesFromPrev)} mi
            </span>
          </div>
          <p className="text-[13px] text-muted">
            <span className="font-medium text-ink">{s.brand}</span> · {s.address || 'Address unavailable'}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-3 rounded-lg bg-[rgb(20_24_22)] px-3 py-2 text-[rgb(244_178_56)]">
          <Price value={s.price} size="lg" />
          <div className="flex flex-col text-[11px] leading-tight text-[rgb(200_208_204)]">
            <span>per gallon</span>
            {diff != null && (
              <span className={`flex items-center gap-0.5 font-semibold ${diff <= 0 ? 'text-[rgb(110_214_150)]' : 'text-[rgb(250_140_128)]'}`}>
                {diff <= 0 ? <TrendingDown size={12} aria-hidden /> : <TrendingUp size={12} aria-hidden />}
                {diff <= 0 ? `${Math.abs(diff * 100).toFixed(0)}¢ below` : `${(diff * 100).toFixed(0)}¢ above`} area avg ${s.areaAvg.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="tabular font-semibold">
              {Math.round(stop.arrivalPct)}% <ArrowRight size={12} className="inline" aria-label="to" /> {Math.round(stop.departurePct)}%
            </span>
            <span className="tabular text-muted">
              Pump <strong className="text-ink">{stop.gallons.toFixed(1)} gal</strong> · <strong className="text-ink">{money(stop.cost)}</strong>
            </span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-sunk" aria-hidden>
            <div className="absolute inset-y-0 left-0 bg-sign/35" style={{ width: `${Math.min(100, stop.departurePct)}%` }} />
            <div className="absolute inset-y-0 left-0 bg-sign" style={{ width: `${Math.max(0, stop.arrivalPct)}%` }} />
          </div>
          <p className="text-[11px] text-muted">
            {s.detourMi.toFixed(1)} mi off the highway each way · detour fuel {money(stop.detourCost)}
            {s.updatedMinutesAgo != null && (
              <>
                {' · '}
                <Clock size={11} className="inline" aria-hidden /> price {formatAge(s.updatedMinutesAgo)}
              </>
            )}
            {s.priceSource && s.priceSource !== 'Google Places' ? ` · ${s.priceSource}` : ''}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href={gmaps} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] font-medium hover:bg-sunk">
          <ExternalLink size={13} aria-hidden /> Google Maps
        </a>
        <a href={amaps} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-[13px] font-medium hover:bg-sunk">
          <ExternalLink size={13} aria-hidden /> Apple Maps
        </a>
      </div>
    </li>
  );
}

function formatAge(min) {
  if (min < 60) return `${min} min ago`;
  if (min < 60 * 24) return `${Math.round(min / 60)} h ago`;
  return `${Math.round(min / 1440)} d ago`;
}
