# RoadTrip Fuel Optimizer

Plans where to buy fuel on a U.S. road trip. It finds the cheapest plan and the plan with the fewest stops, using station prices along the route.

Built with React, Tailwind CSS, Lucide icons and Leaflet. Vite does the build.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # optimizer unit tests
npm run build      # static site in dist/
npm run build:artifact   # one self-contained HTML page for claude.ai artifacts
```

## Modes

**Realistic Demo Mode** works offline, including inside the claude.ai artifact preview.
- Routes run over a built-in network of 47 metros joined by the real Interstate corridors (I-5, I-10, I-40, I-70, I-80, I-90, I-95 and more). Each corridor passes through its real towns.
- Stations are generated at towns and exits with regional brands (Love's, Pilot, Buc-ee's, Sheetz, Costco and others).
- Prices are simulated from state baselines plus brand positioning and per-station noise. They change slightly each day.
- The basemap is an offline vector map of U.S. state outlines, so the map renders without tile servers.

**Live API Mode** calls real services from the browser. Keys go in the settings modal (gear icon) and are saved only in that browser's `localStorage`. The claude.ai artifact sandbox blocks outside requests, so use Live mode from `npm run dev` or a hosted build.

| Need | Providers |
| --- | --- |
| Vehicle specs | EPA fueleconomy.gov REST (`/ws/rest/vehicle/menu/...`), no key. The EPA record has no tank capacity, so the app pre-fills a typical size for the vehicle class and asks you to confirm it. |
| Routing | OSRM (public server or your own), or Mapbox Directions (token) |
| Address autocomplete | Photon / OpenStreetMap (no key), or Mapbox Geocoding v6 (token) |
| Station prices | Google Places API (New) Nearby Search with `fuelOptions` (station-level prices); OpenStreetMap stations via Overpass priced with CollectAPI state averages; or any JSON endpoint (RapidAPI and similar) described by a URL template and field paths |

If a provider doesn't allow browser (CORS) calls, set a CORS proxy prefix in settings.

## How the plan is computed

`src/lib/optimizer.js`

- `PlanningMPG = HighwayMPG × (1 − RealWorldMargin)`. The margin defaults to 10% and covers heavy loads, towing, headwinds, grades and fast cruising.
- `MaxRange = Tank × PlanningMPG` and `UsableRange = MaxRange × (1 − SafetyBuffer)`.
- Starting fuel (10–100%) sets the fuel at mile 0. If you start below the buffer, the plan heads for an early stop.
- Every station has a one-way detour. Getting to it and back burns `2 × detour / MPG` gallons, and its true cost adds `(2 × detour / MPG) × price`.
- **Maximum Savings** is a dynamic program over (station, fuel level, has-stopped) that minimizes dollars spent. It may buy a partial tank to reach cheaper fuel ahead. It adds a stop only when that stop saves at least $1.
- **Minimum Stops + Low Cost** drives until arrival would land in the last 15–25% of the tank (or buffer + 10%). It then fills at the station with the cheapest true cost per gallon in that window. If that ever costs an extra stop, it falls back to a stop-minimizing DP.
- Both plans buy only enough at the last stop to reach the destination with the buffer intact.
- Savings compare the plan with paying the corridor's average price for the same number of gallons.

## Layout

```
src/
  services/apiService.js      # mode switch, settings, area/corridor price averages
  services/demo/              # demo routing, stations, vehicle catalog
  services/live/              # EPA, OSRM/Mapbox, Photon, Places/Overpass/CollectAPI/custom
  lib/optimizer.js            # both strategies
  lib/geo.js                  # distances, sampling, projection, simplification
  components/                 # panels, map, results, settings
  data/                       # Interstate corridors, state outlines, demo prices and vehicles
```
