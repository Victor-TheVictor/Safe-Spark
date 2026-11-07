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
- `/companion` — Sparky AI text and Realtime voice companion
- `/crime-log` — IU log snapshot and live Bloomington Calls for Service feed
- `/safety-gear` — product images and manufacturer links
- `/profile` — local profile and Safe Walk notification permission

Vercel is configured to serve the Vite entry point for app routes through `vercel.json`. Sparky's `/api/sparky/*` backend is implemented as Cloudflare Pages Functions, so deploy the app through Cloudflare Pages to enable AI. The Vercel rewrite does not run these Functions.

## Data and map protection

- Blue Light Phone coordinates are the verified baseline. Do not change `public/emergencyPhones.geojson`, `public/emergencyPhones.json`, or files under `src/components/safety-map/` and `src/components/safety-map/data/` without explicit approval.
- The IU Crime & Fire Log data file is a dated snapshot. The page links to the official IUPD log for the current publication range; refresh the local snapshot before a public release.
- Bloomington Calls for Service are fetched from the City of Bloomington Socrata API at page load. These are police calls, including non-crime activity, and are displayed separately from IU campus crime reports. If the live API is unavailable, the page links to the city source.
- Gear photos and product facts come from manufacturer or product pages. Price and inventory are intentionally not cached.

## MVP capability boundaries

- Name and phone profiles, contacts, primary contact choice, and Safe Walk timers are stored in this browser only. There is no cloud account, SMS verification, password recovery, or cross-device sync.
- SOS options open the phone dialer or a prefilled SMS for the user to review. SafeSpark does not automatically dispatch an alert or contact campus police.
- Safe Walk reminders are browser notifications and require permission. Keep the app tab open; this is not a background safety monitor and it does not message the selected contact.
- Sparky stores conversation history and voice preferences in browser local storage, separated by a random local profile key. This survives refreshes on the same browser, but does not sync to another device and is not tied to verified identity. Deleting the local profile removes its Sparky history.
- Sparky's text, suggestions, completion, and Realtime voice need the Cloudflare Pages Functions and `OPENAI_API_KEY` secret. The companion is mounted once for signed-in app routes; conversation history and preferences remain in this browser's local storage. Voice uses a short-lived Realtime credential, WebRTC, and live audio; raw microphone recordings are not stored by SafeSpark. The optional personal safety phrase is checked only against the user's transcription during an active voice session; no wake-word or background microphone monitoring runs.
- Emergency phrase handling shows a local alert and offers the native dialer or a prefilled SMS draft for a saved contact. The user must place the call or review and send the message; SafeSpark does not automatically dispatch alerts, verify SMS delivery, or contact 911. Location is included only when the app already has a current, user-permitted position.
- Walking directions open Google Maps with the current GPS origin, the verified nearest Blue Light destination, and walking mode.

## Deploy

### Cloudflare Pages (Sparky API)

Connect this GitHub repository to Cloudflare Pages. Set the production branch to the branch you intend to publish, the build command to `npm run build`, and the build output directory to `dist`. The root `functions/` directory contains the Pages Functions; keep it at the repository root. In the Pages project settings, add `OPENAI_API_KEY` as an encrypted production secret (and a preview secret if preview deployments should enable AI). Never add it to a `VITE_` variable or commit it.

You can also set the Pages secret with Wrangler after authenticating:

```sh
npx wrangler pages secret put OPENAI_API_KEY --project-name=safe-spark
```

Run the frontend and Pages Functions locally with `npm run dev:pages`. This builds `dist/` and starts Wrangler Pages at its printed local URL. The plain `npm run dev` Vite server does not execute Cloudflare Pages Functions.

For local AI requests, create a root `.dev.vars` file (already ignored by Git) containing `OPENAI_API_KEY="your-key"`. Do not commit the file. Run `npm run dev:pages` so Cloudflare Pages Functions are served locally; plain `npm run dev` serves the Vite UI only and makes `/api/sparky/*` unavailable. Local and deployed secrets are configured separately.

After deployment, open `/api/sparky/health`. It should return `{"ok":true,"service":"sparky","configured":true,...}`. If `configured` is false, add the secret to the correct Cloudflare environment and redeploy. Keep HTTPS enabled for browser location and microphone permissions.

The API applies same-origin checks and per-isolate request throttling. The current local profile is not server authentication, and isolate memory is not a global rate limiter; configure a Cloudflare edge rate-limiting rule for `/api/sparky/*` before public launch to limit cost abuse.

Vercel remains configured for the existing static app, but it does not provide the Cloudflare Pages Functions in this project. Deploy to Cloudflare Pages for the integrated AI API. Review the crime snapshot date, emergency copy, manufacturer links, and browser permission behavior before public release.
