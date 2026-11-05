# SafeSpark

SafeSpark is a mobile-first campus safety web app for Indiana University Bloomington. The current MVP includes a verified Blue Light Phone map, browser location tracking, nearest-phone distance and walking directions, an on-device Safety Circle, Safe Walk check-in timer, campus and city safety data, and a gear catalog.

## Run locally

Requirements: Node.js 20.19+ or 22.12+ and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:5173`. Browser geolocation works on localhost and HTTPS. On a phone, deploy to HTTPS before requesting location.

## Useful commands

```sh
npm run build
npm run lint
npm run preview
```

## Main routes

- `/` — home, SOS call/text options, Blue Light map preview, nearest facility
- `/contacts` — emergency contacts, call/text shortcuts, Safe Walk timer
- `/map` — full Leaflet map and Google Maps walking directions
- `/companion` — Sparky safety guidance demo
- `/crime-log` — IU log snapshot and live Bloomington Calls for Service feed
- `/safety-gear` — product images and manufacturer links
- `/profile` — local profile and Safe Walk notification permission

Vercel is configured to serve the Vite entry point for app routes through `vercel.json`.

## Data and map protection

- Blue Light Phone coordinates are the verified baseline. Do not change `public/emergencyPhones.geojson`, `public/emergencyPhones.json`, or files under `src/components/safety-map/` and `src/components/safety-map/data/` without explicit approval.
- The IU Crime & Fire Log data file is a dated snapshot. The page links to the official IUPD log for the current publication range; refresh the local snapshot before a public release.
- Bloomington Calls for Service are fetched from the City of Bloomington Socrata API at page load. These are police calls, including non-crime activity, and are displayed separately from IU campus crime reports. If the live API is unavailable, the page links to the city source.
- Gear photos and product facts come from manufacturer or product pages. Price and inventory are intentionally not cached.

## MVP capability boundaries

- Name and phone profiles, contacts, primary contact choice, and Safe Walk timers are stored in this browser only. There is no cloud account, SMS verification, password recovery, or cross-device sync.
- SOS options open the phone dialer or a prefilled SMS for the user to review. SafeSpark does not automatically dispatch an alert or contact campus police.
- Safe Walk reminders are browser notifications and require permission. Keep the app tab open; this is not a background safety monitor and it does not message the selected contact.
- Sparky replies are a local demo. No AI service credentials or server are configured.
- Walking directions open Google Maps with the current GPS origin, the verified nearest Blue Light destination, and walking mode.

## Deploy

Build with `npm run build` and deploy the generated `dist/` directory to Vercel. Keep HTTPS enabled for location permissions. Review the data snapshot date, all emergency copy, manufacturer links, and browser-permission behavior on a real phone before public release.
