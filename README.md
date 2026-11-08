# SafeSpark

SafeSpark is a mobile-first campus safety web app for Indiana University Bloomington. The current MVP includes a verified Blue Light Phone map, browser location tracking, nearest-phone distance and walking directions, an on-device Safety Circle, Safe Walk check-in timer, campus and city safety data, and a gear catalog.

## Run locally

Requirements: Node.js 20.19+ or 22.12+ and npm.

```sh
npm install
npm run dev
```

`npm run dev` builds the app and starts Cloudflare Pages locally at `http://localhost:8790`, including Sparky's `/api/sparky/*` functions. Browser geolocation and microphone access work on localhost after browser permission is granted. This local Pages command does not hot-reload; use `npm run dev:vite` for frontend-only Vite work (Sparky AI APIs will be unavailable), or `npm run dev:pages` for the same full-stack preview on port 8790. On a phone, deploy to HTTPS before requesting location or microphone access.

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
- `/sparky/chat` — independent Sparky text-chat page
- `/sparky/voice` — independent Realtime voice page
- `/companion` — legacy route alias that opens Sparky text chat
- `/crime-log` — IU log snapshot and live Bloomington Calls for Service feed
- `/safety-gear` — product images and manufacturer links
- `/profile` — local profile and Safe Walk notification permission

Vercel is configured to serve the Vite entry point for app routes through `vercel.json`. Sparky's `/api/sparky/*` backend is implemented as Cloudflare Pages Functions, so deploy the app through Cloudflare Pages to enable AI. The Vercel rewrite does not run these Functions.

## Data and map protection

- Blue Light Phone coordinates are the verified baseline. Do not change `public/emergencyPhones.geojson`, `public/emergencyPhones.json`, or files under `src/components/safety-map/` and `src/components/safety-map/data/` without explicit approval.
- The app keeps exact GPS in local device state; it sends an approximate point to OpenStreetMap Nominatim to resolve a nearby place name on first location fix and after meaningful movement. Results are throttled and OpenStreetMap contributors are attributed in the location card.
- The IU Crime & Fire Log data file is a dated snapshot. The page links to the official IUPD log for the current publication range; refresh the local snapshot before a public release.
- Bloomington Calls for Service are fetched from the City of Bloomington Socrata API at page load and refreshed every minute while the page is visible. These are police calls, including non-crime activity, and are displayed separately from IU campus crime reports. The feed can only show new calls after the city publishes them. If the live API is unavailable, the page links to the city source.
- Gear photos and product facts come from manufacturer or product pages. Price and inventory are intentionally not cached.

## MVP capability boundaries

- Name and phone profiles, contacts, primary contact choice, and Safe Walk timers are stored in this browser only. There is no cloud account, SMS verification, password recovery, or cross-device sync.
- SOS options open the phone dialer or a prefilled SMS for the user to review. SafeSpark does not automatically dispatch an alert or contact campus police.
- Safe Walk reminders are browser notifications and require permission. Keep the app tab open; this is not a background safety monitor and it does not message the selected contact.
- Sparky stores conversation history, local conversation IDs, voice preferences, and safety-phrase event status in browser local storage under a local profile key. Text and voice share that history across routes and refreshes on the same browser; they do not sync to another device and are not tied to verified identity. Deleting the local profile removes these records.
- Text chat streams from the OpenAI Responses API. The model may request allowlisted navigation or a saved-contact action; the app validates routes/contact matches, and calls or texts require a user click to open the native phone app. Voice uses the OpenAI Realtime API with `gpt-realtime-2.1`, short-lived credentials, WebRTC, server VAD, interruption support, and live audio. Raw microphone recordings are not stored by SafeSpark. The optional safety phrase is checked only against the user's transcription during an active voice session; no wake-word or background microphone monitoring runs.
- Emergency phrase handling records a minimal event timestamp and action status on this device, then offers the native dialer or a prefilled SMS draft for a saved contact. The user must place the call or review and send the message; SafeSpark does not automatically dispatch alerts, verify SMS delivery, or contact 911. Location is included only when the app already has a current, user-permitted position.
- Walking directions open Google Maps with the current GPS origin, the verified nearest Blue Light destination, and walking mode.

## Deploy

### Cloudflare Pages (Sparky API)

Connect this GitHub repository to Cloudflare Pages. Set the production branch to the branch you intend to publish, the build command to `npm run build`, and the build output directory to `dist`. The root `functions/` directory contains the Pages Functions; keep it at the repository root. In the Pages project settings, add `OPENAI_API_KEY` as an encrypted production secret (and a preview secret if preview deployments should enable AI). Never add it to a `VITE_` variable or commit it.

You can also set the Pages secret with Wrangler after authenticating:

```sh
npx wrangler pages secret put OPENAI_API_KEY --project-name=safe-spark
```

Run the full-stack local preview with `npm run dev` or `npm run dev:pages`; both build `dist/` and start Wrangler Pages. The frontend-only `npm run dev:vite` Vite server does not execute Cloudflare Pages Functions, so AI and voice are unavailable there.

For local AI requests, create a root `.dev.vars` file (already ignored by Git) containing `OPENAI_API_KEY="your-key"`. Do not commit the file. Local and deployed secrets are configured separately.

After deployment, open `/api/sparky/health`. It should return `{"ok":true,"service":"sparky","configured":true,...}`. If `configured` is false, add the secret to the correct Cloudflare environment and redeploy. Keep HTTPS enabled for browser location and microphone permissions.

The API applies same-origin checks and per-isolate request throttling. The current local profile is not server authentication, and isolate memory is not a global rate limiter. There is no configured database or verified account system in this project; do not store sensitive conversations or contacts in a server database until identity and access control are added. Configure a Cloudflare edge rate-limiting rule for `/api/sparky/*` before public launch to limit cost abuse.

Vercel remains configured for the existing static app, but it does not provide the Cloudflare Pages Functions in this project. Deploy to Cloudflare Pages for the integrated AI API. Review the crime snapshot date, emergency copy, manufacturer links, and browser permission behavior before public release.
