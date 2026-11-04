// Demo Mode vehicle catalog. Highway MPG follows EPA ratings for these trims and
// tank sizes follow manufacturer specs, rounded; confirm with Live API Mode.
// One trim (Outback) deliberately omits tank size to exercise the "confirm tank size" prompt.
const V = (make, model, trim, hwy, fuel, tank, vclass) => ({ make, model, trim, hwy, fuel, tank, vclass });

const CATALOG = [
  V('Toyota', 'Camry', 'LE 2.5L FWD', 39, 'regular', 15.8, 'Midsize Cars'),
  V('Toyota', 'Camry', 'XSE AWD', 36, 'regular', 14.4, 'Midsize Cars'),
  V('Toyota', 'RAV4', 'LE FWD', 35, 'regular', 14.5, 'Small Sport Utility Vehicle 2WD'),
  V('Toyota', 'RAV4', 'Hybrid XLE AWD', 38, 'regular', 14.5, 'Small Sport Utility Vehicle 4WD'),
  V('Toyota', 'Prius', 'LE FWD', 56, 'regular', 11.3, 'Midsize Cars'),
  V('Toyota', 'Highlander', 'XLE 2.4T AWD', 28, 'regular', 17.9, 'Standard Sport Utility Vehicle 4WD'),
  V('Honda', 'Civic', 'LX Sedan', 40, 'regular', 12.4, 'Compact Cars'),
  V('Honda', 'CR-V', 'EX FWD', 34, 'regular', 14.0, 'Small Sport Utility Vehicle 2WD'),
  V('Honda', 'Odyssey', 'EX-L', 28, 'regular', 19.5, 'Minivan - 2WD'),
  V('Ford', 'F-150', 'XLT 2.7L EcoBoost 4x2', 25, 'regular', 23.0, 'Standard Pickup Trucks 2WD'),
  V('Ford', 'F-150', 'Lariat 3.5L EcoBoost 4x4', 23, 'regular', 26.0, 'Standard Pickup Trucks 4WD'),
  V('Chevrolet', 'Silverado 1500', 'LT 3.0L Duramax Diesel 2WD', 30, 'diesel', 24.0, 'Standard Pickup Trucks 2WD'),
  V('Chevrolet', 'Silverado 1500', 'LT 5.3L V8 4WD', 20, 'regular', 24.0, 'Standard Pickup Trucks 4WD'),
  V('Jeep', 'Grand Cherokee', 'Laredo 3.6L 4x4', 26, 'regular', 23.0, 'Standard Sport Utility Vehicle 4WD'),
  V('Subaru', 'Outback', '2.5i Premium AWD', 32, 'regular', null, 'Small Station Wagons'),
  V('BMW', '3 Series', '330i Sedan', 34, 'premium', 15.6, 'Compact Cars'),
];

export const DEMO_YEARS = [2025, 2024, 2023];

export function demoMakes() {
  return [...new Set(CATALOG.map((v) => v.make))].sort();
}
export function demoModels(make) {
  return [...new Set(CATALOG.filter((v) => v.make === make).map((v) => v.model))].sort();
}
export function demoTrims(make, model) {
  return CATALOG.filter((v) => v.make === make && v.model === model).map((v, i) => ({
    id: `${make}|${model}|${v.trim}`,
    label: v.trim,
    index: i,
  }));
}
export function demoVehicle(id, year) {
  const [make, model, trim] = id.split('|');
  const v = CATALOG.find((c) => c.make === make && c.model === model && c.trim === trim);
  if (!v) return null;
  return {
    id,
    year,
    make,
    model,
    trim,
    highwayMpg: v.hwy,
    fuelType: v.fuel,
    tankGallons: v.tank,
    vehicleClass: v.vclass,
    source: 'demo',
  };
}
