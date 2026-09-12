import type { PointState } from "../types.ts";

export type LatLng = { lat: number; lng: number; name?: string };

export type TripPlan = {
  coords: [number, number][];
  km: number;
  minutes: number;
  hits: PointState[];
  via: LatLng | null;
  from: LatLng;
  to: LatLng;
};

function toRad(n: number): number {
  return (n * Math.PI) / 180;
}

export function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function distPointToSegmentM(p: LatLng, a: [number, number], b: [number, number]): number {
  const ax = a[1];
  const ay = a[0];
  const bx = b[1];
  const by = b[0];
  const px = p.lng;
  const py = p.lat;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return haversineM(p, { lat: ay + t * dy, lng: ax + t * dx });
}

export function pointsOnRoute(
  points: PointState[],
  coords: [number, number][],
  radiusM = 280,
): PointState[] {
  if (coords.length < 2) return [];
  return points.filter((p) => {
    let min = Infinity;
    for (let i = 1; i < coords.length; i++) {
      min = Math.min(min, distPointToSegmentM(p, coords[i - 1], coords[i]));
      if (min <= radiusM) return true;
    }
    return false;
  });
}

type OsrmJson = {
  code?: string;
  routes?: Array<{
    distance: number;
    duration: number;
    geometry?: { coordinates?: [number, number][] };
  }>;
};

function decode(json: OsrmJson): { coords: [number, number][]; km: number; minutes: number } | null {
  const route = json.routes?.[0];
  if (!route?.geometry?.coordinates?.length) return null;
  return {
    coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    km: Math.round((route.distance / 1000) * 10) / 10,
    minutes: Math.max(1, Math.round(route.duration / 60)),
  };
}

async function osrm(points: LatLng[], alternatives = false): Promise<ReturnType<typeof decode>> {
  const path = points.map((p) => `${p.lng},${p.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${path}?overview=full&geometries=geojson${alternatives ? "&alternatives=true" : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Routing HTTP ${res.status}`);
  return decode((await res.json()) as OsrmJson);
}

export async function planTrip(
  from: LatLng,
  to: LatLng,
  flooded: PointState[],
  clear: PointState[],
): Promise<TripPlan> {
  const direct = await osrm([from, to], true);
  if (!direct) throw new Error("No driving route");
  const hits = pointsOnRoute(flooded, direct.coords);
  if (hits.length === 0) {
    return { ...direct, hits: [], via: null, from, to };
  }

  const viaCandidates = clear
    .map((p) => ({
      p,
      score: haversineM(from, p) + haversineM(p, to),
    }))
    .sort((a, b) => a.score - b.score);

  for (const c of viaCandidates.slice(0, 4)) {
    const diverted = await osrm([from, c.p, to]).catch(() => null);
    if (!diverted) continue;
    const again = pointsOnRoute(flooded, diverted.coords);
    if (again.length < hits.length) {
      return {
        ...diverted,
        hits,
        via: { lat: c.p.lat, lng: c.p.lng, name: c.p.name },
        from,
        to,
      };
    }
  }

  return { ...direct, hits, via: null, from, to };
}
