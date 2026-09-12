import { FORECAST_STEPS } from "../data/catchment.ts";
import { OCT2020_SCALED_HOURLY_MM } from "../data/oct2020.ts";
import type { LiveRain, Provenance, RainSourceId } from "../types.ts";
import { constantSeries, hourlyToSteps } from "./solver.ts";

export const OPEN_METEO_FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast?latitude=17.45&longitude=78.41&current=precipitation,rain&hourly=precipitation&timezone=Asia%2FKolkata&forecast_days=1";

export const OPEN_METEO_LAT = 17.45;
export const OPEN_METEO_LNG = 78.41;

export type RainInput = {
  series: number[];
  mmPerHr: number;
  provenance: Provenance;
  live?: LiveRain;
};

export type OpenMeteoForecastJson = {
  current?: {
    time?: string;
    interval?: number;
    precipitation?: number;
    rain?: number;
    weather_code?: number;
    temperature_2m?: number;
    relative_humidity_2m?: number;
  };
  hourly?: {
    time?: string[];
    precipitation?: number[];
  };
};

export function weatherLabel(code: number | undefined): string {
  if (code == null) return "Unknown";
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 99) return "Thunderstorm";
  return "Overcast";
}

export function precipitationToMmPerHr(mm: number, intervalSec: number): number {
  if (!Number.isFinite(mm) || mm < 0) return 0;
  if (!Number.isFinite(intervalSec) || intervalSec <= 0) return mm;
  return mm * (3600 / intervalSec);
}

export function parseOpenMeteoForecast(json: OpenMeteoForecastJson): LiveRain {
  const intervalSec = json.current?.interval ?? 900;
  const mm = json.current?.precipitation ?? json.current?.rain ?? 0;
  const mmPerHr = precipitationToMmPerHr(mm, intervalSec);
  const hourlyMm = json.hourly?.precipitation ?? [];
  const hourlyTimes = json.hourly?.time ?? [];
  const rain24hMm = hourlyMm.slice(0, 24).reduce((a, b) => a + (b || 0), 0);
  const peak48hMmHr = hourlyMm.slice(0, 48).reduce((m, v) => Math.max(m, v || 0), 0);
  return {
    mmPerHr,
    hourlyMm,
    hourlyTimes,
    observedAt: json.current?.time ?? new Date().toISOString(),
    source: `Open-Meteo forecast ${OPEN_METEO_LAT}N ${OPEN_METEO_LNG}E`,
    degraded: false,
    intervalSec,
    temperatureC: json.current?.temperature_2m,
    humidity: json.current?.relative_humidity_2m,
    weather: weatherLabel(json.current?.weather_code),
    rain24hMm: Math.round(rain24hMm * 10) / 10,
    peak48hMmHr: Math.round(peak48hMmHr * 10) / 10,
  };
}

export function liveRainToSeries(live: LiveRain, steps = FORECAST_STEPS): number[] {
  const now = live.observedAt.slice(0, 13);
  let start = live.hourlyTimes.findIndex((t) => t.startsWith(now));
  if (start < 0) start = 0;
  const hoursNeeded = Math.max(1, Math.ceil(steps / Math.round(1 / (4 / 60))));
  const slice = live.hourlyMm.slice(start, start + hoursNeeded);
  const use = slice.length > 0 ? slice : [live.mmPerHr];
  const series = hourlyToSteps(use).slice(0, steps);
  while (series.length < steps) series.push(live.mmPerHr);
  return series;
}

export function rainForSource(
  source: RainSourceId,
  live: LiveRain | null,
  steps = FORECAST_STEPS,
  peakMmHr = 95,
): RainInput {
  if (source === "mm20") {
    return {
      series: constantSeries(20, steps),
      mmPerHr: 20,
      provenance: {
        kind: "modelled",
        source: "Acceptance fixture 20 mm/hr constant",
        at: "fixture",
      },
    };
  }
  if (source === "mm68") {
    return {
      series: constantSeries(68, steps),
      mmPerHr: 68,
      provenance: {
        kind: "modelled",
        source: "Acceptance fixture 68 mm/hr constant",
        at: "fixture",
      },
    };
  }
  if (source === "storm") {
    return {
      series: constantSeries(peakMmHr, steps),
      mmPerHr: peakMmHr,
      provenance: {
        kind: "modelled",
        source: `Storm fixture ${peakMmHr} mm/hr constant`,
        at: "fixture",
      },
    };
  }
  if (source === "yesterday") {
    const hourly = live?.hourlyMm?.length ? live.hourlyMm : [live?.mmPerHr ?? 0];
    const series = hourlyToSteps(hourly);
    return {
      series,
      mmPerHr: Math.max(0, ...hourly),
      provenance: {
        kind: "observed",
        source: live?.source ?? "Open-Meteo archive, last hours",
        at: live?.observedAt ?? "archive",
      },
      live: live ?? undefined,
    };
  }
  if (source === "oct2020") {
    const series = hourlyToSteps(OCT2020_SCALED_HOURLY_MM);
    return {
      series,
      mmPerHr: Math.max(...OCT2020_SCALED_HOURLY_MM),
      provenance: {
        kind: "modelled",
        source:
          "Open-Meteo archive 13 Oct 2020 hourly shape, scaled to reported 318 mm / 24 h",
        at: "2020-10-13T00:00+05:30",
      },
    };
  }
  if (live && !live.degraded) {
    const series = liveRainToSeries(live, steps);
    return {
      series,
      mmPerHr: live.mmPerHr,
      provenance: {
        kind: "observed",
        source: live.source,
        at: live.observedAt,
      },
      live,
    };
  }
  const fallback = live?.mmPerHr ?? 0;
  return {
    series: constantSeries(fallback, steps),
    mmPerHr: fallback,
    provenance: {
      kind: "observed",
      source: live
        ? `${live.source} (degraded, last known)`
        : "No live feed yet; last known 0 mm/hr",
      at: live?.observedAt ?? "unavailable",
    },
    live: live ?? undefined,
  };
}

export async function fetchLiveRain(fetchFn: typeof fetch = fetch): Promise<LiveRain> {
  const res = await fetchFn(OPEN_METEO_FORECAST_URL);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const json = (await res.json()) as OpenMeteoForecastJson;
  return parseOpenMeteoForecast(json);
}
