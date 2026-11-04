// Demo Mode price model. Baselines are illustrative state averages for regular
// unleaded (USD/gal) that keep realistic relative gaps between states (California
// and Washington high, Gulf Coast and the Plains low). They are simulated, not live.
export const STATE_REGULAR = {
  AL: 2.79, AZ: 3.39, AR: 2.74, CA: 4.69, CO: 3.07, CT: 3.19, DE: 3.03, DC: 3.35, FL: 3.09,
  GA: 2.86, ID: 3.34, IL: 3.36, IN: 3.04, IA: 2.86, KS: 2.79, KY: 2.89, LA: 2.69, ME: 3.19,
  MD: 3.13, MA: 3.17, MI: 3.12, MN: 2.94, MS: 2.66, MO: 2.74, MT: 3.19, NE: 2.89, NV: 3.99,
  NH: 3.07, NJ: 3.04, NM: 2.97, NY: 3.29, NC: 2.93, ND: 2.98, OH: 2.98, OK: 2.62, OR: 4.08,
  PA: 3.29, RI: 3.13, SC: 2.79, SD: 2.98, TN: 2.77, TX: 2.67, UT: 3.29, VT: 3.19, VA: 2.98,
  WA: 4.29, WV: 3.08, WI: 2.94, WY: 3.07,
};

// Typical spread over regular for each grade; diesel varies more by region.
export const GRADE_OFFSET = { regular: 0, midgrade: 0.47, premium: 0.86, diesel: 0.78 };
const DIESEL_STATE_ADJ = { CA: 0.62, WA: 0.35, OR: 0.3, NV: 0.2, PA: 0.25, NY: 0.3, TX: -0.12, OK: -0.1 };

// Brand price positioning relative to the local average, with regions where each appears.
// `truck` brands cluster at Interstate exits; `club` is a warehouse store (cheapest, sits further off-route).
export const BRANDS = [
  { brand: "Love's", label: "Love's Travel Stop", offset: -0.03, truck: true, states: '*' },
  { brand: 'Pilot', label: 'Pilot Travel Center', offset: 0.02, truck: true, states: '*' },
  { brand: 'Flying J', label: 'Flying J Travel Center', offset: 0.02, truck: true, states: '*' },
  { brand: 'TA', label: 'TA Travel Center', offset: 0.05, truck: true, states: '*' },
  { brand: 'Shell', label: 'Shell', offset: 0.12, states: '*' },
  { brand: 'Chevron', label: 'Chevron', offset: 0.14, states: 'CA WA OR NV AZ UT ID NM TX LA MS AL GA FL TN' },
  { brand: 'Exxon', label: 'Exxon', offset: 0.09, states: 'TX LA MS AL GA FL TN NC SC VA MD PA NJ NY CT MA OH KY IL MO OK AR' },
  { brand: 'Mobil', label: 'Mobil', offset: 0.1, states: 'CA AZ TX IL MI OH NY NJ CT MA PA VA' },
  { brand: 'BP', label: 'BP', offset: 0.07, states: 'IL IN OH MI WI MN GA FL NC SC VA PA NY NJ' },
  { brand: 'Valero', label: 'Valero', offset: 0.0, states: 'CA TX OK LA AR TN KS NM' },
  { brand: 'Phillips 66', label: 'Phillips 66', offset: 0.04, states: 'TX OK KS MO CO NM AZ CA WA OR NE IA MN IL WY MT' },
  { brand: 'Conoco', label: 'Conoco', offset: 0.03, states: 'CO NM TX WY MT ID UT OK' },
  { brand: 'Sinclair', label: 'Sinclair', offset: 0.02, states: 'WY UT ID MT CO NM NE AZ NV' },
  { brand: 'Maverik', label: 'Maverik', offset: -0.04, states: 'UT ID WY NV CO NM AZ MT' },
  { brand: 'Arco', label: 'ARCO', offset: -0.12, states: 'CA WA OR NV AZ' },
  { brand: "Buc-ee's", label: "Buc-ee's", offset: -0.08, states: 'TX AL GA FL TN SC MO CO KY' },
  { brand: 'QuikTrip', label: 'QuikTrip', offset: -0.05, states: 'OK KS MO TX GA NC SC AZ' },
  { brand: 'RaceTrac', label: 'RaceTrac', offset: -0.04, states: 'TX LA MS AL GA FL TN' },
  { brand: 'Sheetz', label: 'Sheetz', offset: -0.03, states: 'PA MD VA WV NC OH' },
  { brand: 'Wawa', label: 'Wawa', offset: -0.02, states: 'PA NJ DE MD VA FL' },
  { brand: "Casey's", label: "Casey's", offset: -0.02, states: 'IA MO NE KS MN IL IN OH SD ND OK AR KY TN WI' },
  { brand: 'Kwik Trip', label: 'Kwik Trip', offset: -0.04, states: 'WI MN IA' },
  { brand: 'Speedway', label: 'Speedway', offset: 0.03, states: 'OH IN MI IL KY PA NY NC SC VA TN' },
  { brand: 'Murphy USA', label: 'Murphy USA', offset: -0.09, states: 'TX OK AR LA MS AL GA FL TN SC NC KY MO' },
  { brand: 'Circle K', label: 'Circle K', offset: 0.03, states: '*' },
  { brand: 'Costco', label: 'Costco Gas', offset: -0.27, club: true, states: '*' },
  { brand: "Sam's Club", label: "Sam's Club Fuel", offset: -0.22, club: true, states: '*' },
];

export function brandsForState(state) {
  return BRANDS.filter((b) => b.states === '*' || b.states.split(' ').includes(state));
}

export function basePrice(state, grade) {
  const regular = STATE_REGULAR[state] ?? 3.1;
  const dieselAdj = grade === 'diesel' ? DIESEL_STATE_ADJ[state] ?? 0 : 0;
  return regular + (GRADE_OFFSET[grade] ?? 0) + dieselAdj;
}
