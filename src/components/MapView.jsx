import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { statesGeoJSON } from '../data/usStates.js';
import { simplify } from '../lib/geo.js';

const fmtPrice = (p) => `$${p.toFixed(2)}`;

/**
 * Leaflet map with an offline vector basemap (U.S. states) so it renders anywhere,
 * plus optional OpenStreetMap tiles when the network allows them.
 */
export default function MapView({ route, stations, plan, origin, destination, selectedStop, onSelectStop, showTiles }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layersRef = useRef({});

  // Init once.
  useEffect(() => {
    const map = L.map(elRef.current, { zoomControl: true, attributionControl: true, worldCopyJump: false, minZoom: 3 }).setView([38.5, -97], 4);
    map.attributionControl.setPrefix(false);
    L.geoJSON(statesGeoJSON(), { interactive: false, style: { className: 'map-state', weight: 1 } }).addTo(map);
    map.attributionControl.addAttribution('States: U.S. Census via us-atlas');
    layersRef.current.overlay = L.layerGroup().addTo(map);
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      map.remove();
    };
  }, []);

  // Street tiles.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (showTiles && !layersRef.current.tiles) {
      layersRef.current.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        className: 'map-tiles',
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      layersRef.current.tiles.bringToBack();
    } else if (!showTiles && layersRef.current.tiles) {
      layersRef.current.tiles.remove();
      layersRef.current.tiles = null;
    }
  }, [showTiles]);

  // Route, stations, stops.
  useEffect(() => {
    const map = mapRef.current;
    const group = layersRef.current.overlay;
    if (!map || !group) return;
    group.clearLayers();

    if (route) {
      const line = simplify(route.coords, 0.08);
      L.polyline(line, { className: 'route-casing', weight: 8, interactive: false }).addTo(group);
      L.polyline(line, { className: 'route-line', weight: 4, interactive: false }).addTo(group);
    }

    if (stations?.length) {
      const prices = stations.map((s) => s.price).sort((a, b) => a - b);
      const lo = prices[Math.floor(prices.length * 0.2)];
      const hi = prices[Math.floor(prices.length * 0.8)];
      for (const s of stations) {
        const tier = s.price <= lo ? 'cheap' : s.price >= hi ? 'pricey' : 'mid';
        L.circleMarker([s.lat, s.lng], { radius: 3.5, weight: 1, className: `station-dot ${tier}` })
          .bindTooltip(`<strong>${escapeHtml(s.name)}</strong><br>${fmtPrice(s.price)} · mile ${Math.round(s.mile)} · ${s.detourMi.toFixed(1)} mi off`, { direction: 'top', offset: [0, -4] })
          .addTo(group);
      }
    }

    if (plan) {
      for (const stop of plan.stops) {
        const s = stop.station;
        const icon = L.divIcon({
          className: '',
          iconSize: null,
          html: `<div class="stop-pin ${selectedStop === stop.n ? 'selected' : ''}"><span class="num">${stop.n}</span><span class="price">${fmtPrice(s.price)}<sup style="font-size:.6em">${Math.round(s.price * 1000) % 10 || ''}</sup></span></div>`,
        });
        L.marker([s.lat, s.lng], { icon, zIndexOffset: 1000 + (selectedStop === stop.n ? 500 : 0), keyboard: true, title: `Stop ${stop.n}: ${s.name}` })
          .on('click', () => onSelectStop?.(stop.n))
          .addTo(group);
      }
    }

    const endIcon = (letter, cls) => L.divIcon({ className: '', iconSize: null, html: `<div class="end-pin ${cls}">${letter}</div>` });
    if (origin) L.marker([origin.lat, origin.lng], { icon: endIcon('A', 'start'), zIndexOffset: 2000, title: origin.label }).addTo(group);
    if (destination) L.marker([destination.lat, destination.lng], { icon: endIcon('B', 'end'), zIndexOffset: 2000, title: destination.label }).addTo(group);
  }, [route, stations, plan, origin, destination, selectedStop, onSelectStop]);

  // Fit to the route when it changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !route) return;
    map.fitBounds(L.latLngBounds(route.coords), { padding: [30, 30] });
  }, [route]);

  // Pan to a selected stop.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !plan || !selectedStop) return;
    const stop = plan.stops.find((s) => s.n === selectedStop);
    if (stop) map.panTo([stop.station.lat, stop.station.lng], { animate: true });
  }, [selectedStop, plan]);

  return <div ref={elRef} className="h-full w-full" role="region" aria-label="Route map" />;
}

function escapeHtml(s = '') {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
