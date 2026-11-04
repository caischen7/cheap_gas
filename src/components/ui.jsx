import { useId } from 'react';

export function Section({ title, icon: Icon, children, aside }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-semibold uppercase tracking-[0.08em] text-muted">
          {Icon && <Icon size={16} aria-hidden />}
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, hint, children, htmlFor }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

const inputCls =
  'w-full min-w-0 rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-muted/70 disabled:opacity-50';

export function Select({ id, value, onChange, options, placeholder, disabled }) {
  return (
    <select id={id} className={inputCls} value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function NumberInput({ id, value, onChange, step = 'any', min, max, suffix }) {
  return (
    <div className="relative">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className={`${inputCls} tabular pr-12`}
        value={value ?? ''}
        step={step}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{suffix}</span>}
    </div>
  );
}

export function TextInput({ id, value, onChange, placeholder, type = 'text', ...rest }) {
  return <input id={id} type={type} className={inputCls} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} {...rest} />;
}

export function Slider({ id, label, value, onChange, min, max, step = 1, format, hint }) {
  const auto = useId();
  const sid = id || auto;
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={sid} className="text-[13px] font-medium">
          {label}
        </label>
        <span className="tabular font-display text-lg font-semibold leading-none">{format ? format(value) : value}</span>
      </div>
      <input id={sid} type="range" min={min} max={max} step={step} value={value} style={{ '--fill': `${fill}%` }} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-sunk p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors ${
              active ? 'bg-panel text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            {o.icon && <o.icon size={14} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Pump-style price: $3.29 with the trailing 9/10 cent as a superscript. */
export function Price({ value, className = '', size = 'md' }) {
  if (value == null || !Number.isFinite(value)) return <span className={className}>—</span>;
  const thousandths = Math.round(value * 1000);
  const dollars = Math.floor(thousandths / 1000);
  const cents = Math.floor((thousandths % 1000) / 10);
  const tenth = thousandths % 10;
  const sz = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-base' : 'text-xl';
  return (
    <span className={`tabular font-display font-bold leading-none ${sz} ${className}`}>
      ${dollars}.{String(cents).padStart(2, '0')}
      {tenth ? <sup className="ml-px text-[0.55em]">{tenth}</sup> : null}
    </span>
  );
}

export const money = (v, digits = 2) =>
  v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits });

export const num = (v, digits = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
