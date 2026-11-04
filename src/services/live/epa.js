// U.S. EPA fueleconomy.gov web services (free, no key):
// https://www.fueleconomy.gov/feg/ws/index.shtml
import { http } from './http.js';

const BASE = 'https://www.fueleconomy.gov/ws/rest';

const asList = (data) => {
  const items = data?.menuItem;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
};

function get(path, corsProxy) {
  return http(`${BASE}${path}`, { service: 'EPA fueleconomy.gov', corsProxy, headers: { Accept: 'application/json' } });
}

const q = encodeURIComponent;

export function epaVehicles(corsProxy) {
  return {
    years: async () => asList(await get('/vehicle/menu/year', corsProxy)).map((i) => Number(i.value)).sort((a, b) => b - a),
    makes: async (year) => asList(await get(`/vehicle/menu/make?year=${q(year)}`, corsProxy)).map((i) => i.value),
    models: async (year, make) => asList(await get(`/vehicle/menu/model?year=${q(year)}&make=${q(make)}`, corsProxy)).map((i) => i.value),
    options: async (year, make, model) =>
      asList(await get(`/vehicle/menu/options?year=${q(year)}&make=${q(make)}&model=${q(model)}`, corsProxy)).map((i) => ({
        value: String(i.value),
        text: i.text,
      })),
    details: async (id) => {
      const v = await get(`/vehicle/${q(id)}`, corsProxy);
      const fuelType = mapFuel(v.fuelType1 || v.fuelType);
      return {
        id: String(id),
        year: Number(v.year),
        make: v.make,
        model: v.model,
        trim: [v.trany, v.displ ? `${v.displ}L` : '', v.drive].filter(Boolean).join(' · '),
        highwayMpg: Number(v.highway08) || null,
        fuelType,
        fuelLabel: v.fuelType1 || v.fuelType,
        // The EPA record has no fuel tank capacity; the UI asks the driver to confirm one.
        tankGallons: null,
        tankEstimate: estimateTank(v.VClass),
        vehicleClass: v.VClass,
        unsupported: fuelType === null ? `${v.fuelType1 || v.fuelType} vehicles aren't supported by this gas-station planner.` : null,
        source: 'epa',
      };
    },
  };
}

function mapFuel(label = '') {
  const l = label.toLowerCase();
  if (l.includes('diesel')) return 'diesel';
  if (l.includes('premium')) return 'premium';
  if (l.includes('midgrade')) return 'midgrade';
  if (l.includes('regular') || l.includes('gasoline')) return 'regular';
  return null; // electricity, hydrogen, CNG
}

/** Typical tank size by EPA size class, used only to pre-fill the confirmation field. */
export function estimateTank(vclass = '') {
  const c = vclass.toLowerCase();
  if (c.includes('pickup')) return c.includes('small') ? 21 : 24;
  if (c.includes('van')) return c.includes('minivan') ? 19.5 : 25;
  if (c.includes('sport utility')) return c.includes('small') ? 14.5 : 19;
  if (c.includes('two seater') || c.includes('minicompact') || c.includes('subcompact')) return 12.5;
  if (c.includes('compact')) return 13;
  if (c.includes('large')) return 18;
  if (c.includes('wagon')) return 15;
  return 15.5;
}
