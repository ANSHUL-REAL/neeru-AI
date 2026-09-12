# Neeru

Live site (after Pages deploys): https://anshul-real.github.io/neeru-AI/

A flood desk for any city. Search a place, run a storm, see which roads pond, ask where to go next.

## Demo

1. Open the site.
2. Click **Run a storm** (or **Console**).
3. Pick a city (Houston, Jakarta, Hyderabad, or search).
4. The console should show depths, agents, and an approval queue. If it is still dry, click **Run storm** on the console (Peak 95 mm/hr modelled).
5. Ask **What should I do?** or **Where should I go next?**

## Run locally

```bash
npm install
npm test
npm run dev
```

Open http://127.0.0.1:5173/

Optional: copy `.env.example` to `.env` and add `OPENROUTER_API_KEY` for live Help answers. Without it, Help still answers from the map using a local fallback.

`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` store the call log if you ran `supabase/schema.sql`.

## What is live

- OpenStreetMap tiles
- Open-Meteo geocoding, elevation, forecast
- OSM Overpass tunnels/drains when the API answers
- OpenRouter for Help copy when a key is present

The solver, agents, and approval gate are local. Nothing is sent to the public.

A flood desk for any city. Search Jakarta, Houston, Dhaka, or your own location. Live rain and a height-field solver produce one verdict: this road, this deep, in this many minutes.

## Run

```bash
cd neeru
npm install
npm test
npm run dev
```

Open http://127.0.0.1:5173/

## Optional keys

Copy `.env.example` to `.env`.

- `OPENROUTER_API_KEY` — two-sentence operator brief (also paste in Connect)
- `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` — persist desks. Run `supabase/schema.sql` first.

Without keys the desk still runs. Brief and save stay off.

## What is live

- OpenStreetMap tiles
- Open-Meteo geocoding, elevation, forecast, archive
- OSM Overpass tunnels/drains when the API answers

The solver, agents, and approval gate are local. Nothing is sent to the public.
