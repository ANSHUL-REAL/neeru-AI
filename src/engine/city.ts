import { bboxAround, type Catchment } from "../data/catchment.ts";
import type { BBox, LiveRain } from "../types.ts";
import { parseOpenMeteoForecast, precipitationToMmPerHr, type OpenMeteoForecastJson } from "./rainfall.ts";
import { buildCatchmentFromGrid, upsample10to48 } from "./terrain.ts";

export type City = {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  lat: number;
  lng: number;
  population?: number;
  admin1?: string;
};

export const QUICK_CITIES: City[] = [
  { id: "jakarta", name: "Jakarta", country: "Indonesia", countryCode: "ID", lat: -6.2088, lng: 106.8456, population: 10562000 },
  { id: "dhaka", name: "Dhaka", country: "Bangladesh", countryCode: "BD", lat: 23.8103, lng: 90.4125, population: 8906000 },
  { id: "lagos", name: "Lagos", country: "Nigeria", countryCode: "NG", lat: 6.5244, lng: 3.3792, population: 14862000 },
  { id: "houston", name: "Houston", country: "United States", countryCode: "US", lat: 29.7604, lng: -95.3698, population: 2304000 },
  { id: "manila", name: "Manila", country: "Philippines", countryCode: "PH", lat: 14.5995, lng: 120.9842, population: 1780000 },
  { id: "bangkok", name: "Bangkok", country: "Thailand", countryCode: "TH", lat: 13.7563, lng: 100.5018, population: 8305000 },
  { id: "miami", name: "Miami", country: "United States", countryCode: "US", lat: 25.7617, lng: -80.1918, population: 442000 },
  { id: "chennai", name: "Chennai", country: "India", countryCode: "IN", lat: 13.0827, lng: 80.2707, population: 7088000 },
  { id: "valencia", name: "Valencia", country: "Spain", countryCode: "ES", lat: 39.4699, lng: -0.3763, population: 791000 },
  { id: "porto-alegre", name: "Porto Alegre", country: "Brazil", countryCode: "BR", lat: -30.0346, lng: -51.2177, population: 1483000 },
];

const LANG: Record<string, string> = {
  ID: "id",
  BD: "bn",
  NG: "en",
  US: "en",
  PH: "en",
  TH: "th",
  IN: "en",
  ES: "es",
  BR: "pt",
  GB: "en",
  PK: "ur",
  MX: "es",
  VN: "vi",
  JP: "ja",
  KE: "en",
};

export function languageFor(code: string): string {
  return LANG[code] ?? "en";
}

export function parseGeocoding(json: {
  results?: Array<{
    id?: number;
    name?: string;
    country?: string;
    country_code?: string;
    latitude?: number;
    longitude?: number;
    population?: number;
    admin1?: string;
  }>;
}): City[] {
  return (json.results ?? [])
    .filter((r) => r.latitude != null && r.longitude != null && r.name)
    .map((r) => ({
      id: String(r.id ?? `${r.name}-${r.latitude}`),
      name: r.name as string,
      country: r.country ?? "",
      countryCode: (r.country_code ?? "").toUpperCase(),
      lat: r.latitude as number,
      lng: r.longitude as number,
      population: r.population,
      admin1: r.admin1,
    }));
}

export async function reversePlace(lat: number, lng: number): Promise<string> {
  const url = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${lat}&longitude=${lng}&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) return "Your location";
  const json = (await res.json()) as {
    results?: Array<{ name?: string; admin1?: string; country?: string }>;
  };
  const r = json.results?.[0];
  return r?.name || r?.admin1 || "Your location";
}

export async function searchCities(query: string): Promise<City[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  return parseGeocoding(await res.json());
}

export async function fetchLiveRainAt(lat: number, lng: number): Promise<LiveRain> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=precipitation,rain,weather_code,temperature_2m,relative_humidity_2m&hourly=precipitation&timezone=auto&forecast_days=2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = (await res.json()) as OpenMeteoForecastJson;
  const live = parseOpenMeteoForecast(json);
  live.source = `Open-Meteo forecast ${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  return live;
}

export async function fetchYesterdayHourly(lat: number, lng: number): Promise<{ mm: number[]; times: string[] }> {
  const end = new Date();
  const start = new Date(end.getTime() - 36 * 3600 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${iso(start)}&end_date=${iso(end)}&hourly=precipitation&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Archive HTTP ${res.status}`);
  const json = (await res.json()) as { hourly?: { precipitation?: number[]; time?: string[] } };
  return { mm: json.hourly?.precipitation ?? [], times: json.hourly?.time ?? [] };
}

export async function fetchElevationSample(bbox: BBox, n = 10): Promise<number[]> {
  const lats: number[] = [];
  const lngs: number[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      lats.push(bbox.north - (r / Math.max(1, n - 1)) * (bbox.north - bbox.south));
      lngs.push(bbox.west + (c / Math.max(1, n - 1)) * (bbox.east - bbox.west));
    }
  }
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(",")}&longitude=${lngs.join(",")}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Elevation HTTP ${res.status}`);
  const json = (await res.json()) as { elevation?: number[] };
  const elev = json.elevation ?? [];
  if (elev.length !== n * n) throw new Error("Elevation grid size mismatch");
  return elev;
}

type OsmSeed = { name: string; lat: number; lng: number; kind: "underpass" | "colony" };

export async function fetchOsmSeeds(bbox: BBox): Promise<OsmSeed[]> {
  const q = `[out:json][timeout:8];(way["tunnel"="yes"]["highway"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});way["waterway"~"drain|river|stream"](${bbox.south},${bbox.west},${bbox.north},${bbox.east}););out center 40;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "text/plain", Accept: "application/json" },
    body: q,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    elements?: Array<{
      tags?: Record<string, string>;
      center?: { lat: number; lon: number };
      lat?: number;
      lon?: number;
    }>;
  };
  const seeds: OsmSeed[] = [];
  const drains: OsmSeed[] = [];
  for (const el of json.elements ?? []) {
    const lat = el.center?.lat ?? el.lat;
    const lng = el.center?.lon ?? el.lon;
    if (lat == null || lng == null) continue;
    const tunnel = el.tags?.tunnel === "yes";
    const name = el.tags?.name || el.tags?.ref || (tunnel ? "Underpass" : el.tags?.waterway || "Channel");
    const item: OsmSeed = { name, lat, lng, kind: tunnel ? "underpass" : "colony" };
    if (tunnel) seeds.push(item);
    else drains.push(item);
  }
  return [...seeds, ...drains].slice(0, 12);
}

export async function fetchDrainPaths(bbox: BBox): Promise<[number, number][][]> {
  const q = `[out:json][timeout:15];way["waterway"~"river|stream|canal|drain"](${bbox.south},${bbox.west},${bbox.north},${bbox.east});out geom 8;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "text/plain", Accept: "application/json" },
      body: q,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as {
      elements?: Array<{ geometry?: Array<{ lat: number; lon: number }> }>;
    };
    return (json.elements ?? [])
      .map((el) => (el.geometry ?? []).map((g) => [g.lat, g.lon] as [number, number]))
      .filter((p) => p.length > 3)
      .slice(0, 6);
  } catch {
    return [];
  }
}

function planeSample(_bbox: BBox, n: number): number[] {
  const out: number[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const fy = r / Math.max(1, n - 1);
      const fx = c / Math.max(1, n - 1);
      out.push(80 + fy * 40 - fx * 25);
    }
  }
  return out;
}

export async function loadCityCatchment(city: City): Promise<Catchment> {
  const bbox = bboxAround(city.lat, city.lng, 8);
  const sample = await fetchElevationSample(bbox, 10).catch(() => planeSample(bbox, 10));
  const seeds = await fetchOsmSeeds(bbox).catch(() => [] as OsmSeed[]);
  const drainPaths = await fetchDrainPaths(bbox).catch(() => [] as [number, number][][]);
  const elev = upsample10to48(sample, 10);
  return buildCatchmentFromGrid({
    bbox,
    elev,
    cityName: city.name,
    language: languageFor(city.countryCode),
    catchmentId: city.id,
    seeds: seeds.filter((s) => s.kind === "underpass").slice(0, 6),
    drainPaths,
    population: city.population,
  });
}

export { precipitationToMmPerHr };
