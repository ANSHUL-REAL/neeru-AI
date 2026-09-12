import { FLOOD_POINTS } from "./floodPoints.ts";
import type { BBox, PointState } from "../types.ts";

export const BBOX: BBox = {
  south: 17.385,
  north: 17.51,
  west: 78.35,
  east: 78.47,
};

export const COLS = 48;
export const ROWS = 48;
export const CELL_COUNT = COLS * ROWS;

/** ~290 m cells over this bbox. Used for volume in m3. */
export const CELL_AREA_M2 = (() => {
  const latM = (BBOX.north - BBOX.south) * 111_320;
  const midLat = (BBOX.north + BBOX.south) / 2;
  const lonM = (BBOX.east - BBOX.west) * 111_320 * Math.cos((midLat * Math.PI) / 180);
  return (latM / ROWS) * (lonM / COLS);
})();

export const BASE_DRAIN_M_HR = 0.018;
export const NALA_DRAIN_M_HR = BASE_DRAIN_M_HR * 100;
export const ACTIVATION_M = 0.3;
export const DT_HOURS = 4 / 60;
export const FORECAST_STEPS = 45;

export const NALA_PATHS: [number, number][][] = [
  [
    [17.51, 78.375],
    [17.495, 78.392],
    [17.49, 78.405],
    [17.472, 78.42],
    [17.466, 78.447],
    [17.45, 78.46],
    [17.435, 78.468],
  ],
  [
    [17.435, 78.4],
    [17.438, 78.429],
    [17.443, 78.442],
    [17.437, 78.448],
    [17.427, 78.452],
    [17.411, 78.462],
    [17.395, 78.468],
  ],
];

export type Catchment = {
  rows: number;
  cols: number;
  bbox: BBox;
  elev: Float64Array;
  drain: Float64Array;
  nala: Uint8Array;
  points: PointState[];
  cellAreaM2: number;
  drainPaths: [number, number][][];
  cityName: string;
};

export function idx(r: number, c: number): number {
  return r * COLS + c;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function latLngToCell(lat: number, lng: number): { r: number; c: number } {
  const c = Math.round(((lng - BBOX.west) / (BBOX.east - BBOX.west)) * (COLS - 1));
  const r = Math.round(((BBOX.north - lat) / (BBOX.north - BBOX.south)) * (ROWS - 1));
  return { r: clamp(r, 0, ROWS - 1), c: clamp(c, 0, COLS - 1) };
}

export function cellToLatLng(r: number, c: number): { lat: number; lng: number } {
  const lat = BBOX.north - (r / (ROWS - 1)) * (BBOX.north - BBOX.south);
  const lng = BBOX.west + (c / (COLS - 1)) * (BBOX.east - BBOX.west);
  return { lat, lng };
}

function planeElev(lat: number, lng: number): number {
  const fy = (lat - BBOX.south) / (BBOX.north - BBOX.south);
  const fx = (lng - BBOX.west) / (BBOX.east - BBOX.west);
  return 588 - fx * 62 - (1 - fy) * 48;
}

function rasterizeLine(
  nala: Uint8Array,
  drain: Float64Array,
  a: { r: number; c: number },
  b: { r: number; c: number },
) {
  let r0 = a.r;
  let c0 = a.c;
  const r1 = b.r;
  const c1 = b.c;
  const dr = Math.abs(r1 - r0);
  const dc = Math.abs(c1 - c0);
  const sr = r0 < r1 ? 1 : -1;
  const sc = c0 < c1 ? 1 : -1;
  let err = dr - dc;
  while (true) {
    const i = idx(r0, c0);
    nala[i] = 1;
    drain[i] = NALA_DRAIN_M_HR;
    if (r0 === r1 && c0 === c1) break;
    const e2 = 2 * err;
    if (e2 > -dc) {
      err -= dc;
      r0 += sr;
    }
    if (e2 < dr) {
      err += dr;
      c0 += sc;
    }
  }
}

export function buildCatchment(): Catchment {
  const elev = new Float64Array(CELL_COUNT);
  const drain = new Float64Array(CELL_COUNT);
  const nala = new Uint8Array(CELL_COUNT);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const { lat, lng } = cellToLatLng(r, c);
      const i = idx(r, c);
      elev[i] = planeElev(lat, lng);
      drain[i] = BASE_DRAIN_M_HR;
    }
  }

  for (const path of NALA_PATHS) {
    for (let k = 1; k < path.length; k++) {
      rasterizeLine(
        nala,
        drain,
        latLngToCell(path[k - 1][0], path[k - 1][1]),
        latLngToCell(path[k][0], path[k][1]),
      );
    }
  }

  const points: PointState[] = FLOOD_POINTS.map((p) => {
    const { r, c } = latLngToCell(p.lat, p.lng);
    const cell = idx(r, c);
    const radius = 2;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
        const d2 = dr * dr + dc * dc;
        if (d2 > radius * radius) continue;
        const j = idx(rr, cc);
        if (nala[j]) continue;
        elev[j] -= 4.2 * Math.exp(-d2 / 2.2);
        drain[j] = BASE_DRAIN_M_HR;
      }
    }
    nala[cell] = 0;
    drain[cell] = BASE_DRAIN_M_HR;
    return {
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      kind: p.kind,
      language: p.language,
      catchment: p.catchment,
      cell,
      elevM: 0,
      depthM: 0,
      peakM: 0,
      onsetStep: null,
      manualRaise: false,
      households: p.households,
      schools: p.schools,
      clinics: p.clinics,
      underpasses: p.underpasses,
      ward: p.ward,
    };
  });

  for (const p of points) {
    const r = Math.floor(p.cell / COLS);
    const c = p.cell % COLS;
    let minN = elev[p.cell];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr;
        const cc = c + dc;
        if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
        minN = Math.min(minN, elev[idx(rr, cc)]);
      }
    }
    elev[p.cell] = minN - 0.65;
    p.elevM = elev[p.cell];
  }

  return {
    rows: ROWS,
    cols: COLS,
    bbox: BBOX,
    elev,
    drain,
    nala,
    points,
    cellAreaM2: CELL_AREA_M2,
    drainPaths: NALA_PATHS,
    cityName: "Hyderabad",
  };
}

export function cellAreaFor(bbox: BBox): number {
  const latM = (bbox.north - bbox.south) * 111_320;
  const midLat = (bbox.north + bbox.south) / 2;
  const lonM = (bbox.east - bbox.west) * 111_320 * Math.cos((midLat * Math.PI) / 180);
  return (latM / ROWS) * (lonM / COLS);
}

export function latLngToCellIn(bbox: BBox, lat: number, lng: number): { r: number; c: number } {
  const c = Math.round(((lng - bbox.west) / (bbox.east - bbox.west)) * (COLS - 1));
  const r = Math.round(((bbox.north - lat) / (bbox.north - bbox.south)) * (ROWS - 1));
  return { r: clamp(r, 0, ROWS - 1), c: clamp(c, 0, COLS - 1) };
}

export function cellToLatLngIn(bbox: BBox, r: number, c: number): { lat: number; lng: number } {
  const lat = bbox.north - (r / (ROWS - 1)) * (bbox.north - bbox.south);
  const lng = bbox.west + (c / (COLS - 1)) * (bbox.east - bbox.west);
  return { lat, lng };
}

export function bboxAround(lat: number, lng: number, km = 8): BBox {
  const dLat = km / 111.32;
  const dLng = km / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return {
    south: lat - dLat,
    north: lat + dLat,
    west: lng - dLng,
    east: lng + dLng,
  };
}

export const CATCHMENT: Catchment = buildCatchment();
