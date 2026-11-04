import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';

/** Address input with debounced autocomplete from the active geocoder. */
export default function PlaceInput({ id, label, value, onSelect, geocode, accent }) {
  const [text, setText] = useState(value?.label ?? '');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState('');
  const reqId = useRef(0);
  const boxRef = useRef(null);

  useEffect(() => setText(value?.label ?? ''), [value?.label]);

  useEffect(() => {
    if (!open) return undefined;
    if (text === value?.label) return undefined;
    const my = ++reqId.current;
    const t = setTimeout(async () => {
      setBusy(true);
      setError('');
      try {
        const res = await geocode(text);
        if (my === reqId.current) {
          setItems(res);
          setActive(res.length ? 0 : -1);
        }
      } catch (e) {
        if (my === reqId.current) {
          setItems([]);
          setError(e.message);
        }
      } finally {
        if (my === reqId.current) setBusy(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [text, open, geocode, value?.label]);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    return () => document.removeEventListener('pointerdown', onDoc);
  }, []);

  const choose = (item) => {
    onSelect(item);
    setText(item.label);
    setOpen(false);
    setItems([]);
  };

  const onKey = (e) => {
    if (!open || !items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(items[active]);
    } else if (e.key === 'Escape') setOpen(false);
  };

  const listId = `${id}-list`;
  return (
    <div className="relative flex flex-col gap-1" ref={boxRef}>
      <label htmlFor={id} className="text-[13px] font-medium">
        {label}
      </label>
      <div className="relative">
        <MapPin size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: accent }} aria-hidden />
        <input
          id={id}
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          className="w-full rounded-md border border-line bg-panel py-2 pl-9 pr-9 text-sm text-ink placeholder:text-muted/70"
          placeholder="City or address"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Typed text that wasn't picked from the list reverts to the chosen place.
            setTimeout(() => {
              setOpen(false);
              setText((t) => (t === value?.label ? t : value?.label ?? ''));
            }, 150);
          }}
          onKeyDown={onKey}
        />
        {busy && <Loader2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted" aria-label="Searching" />}
      </div>
      {open && (items.length > 0 || error) && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 top-full z-[1000] mt-1 max-h-64 overflow-auto rounded-md border border-line bg-panel py-1 shadow-lg">
          {error && <li className="px-3 py-2 text-xs text-bad">{error}</li>}
          {items.map((it, i) => (
            <li
              key={`${it.label}-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerDown={(e) => {
                e.preventDefault();
                choose(it);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-sunk' : ''}`}
            >
              {it.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
