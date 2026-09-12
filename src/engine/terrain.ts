import {
  BASE_DRAIN_M_HR,
  CELL_COUNT,
  COLS,
  NALA_DRAIN_M_HR,
  ROWS,
  cellAreaFor,
  cellToLatLngIn,
  idx,
  latLngToCellIn,
  type Catchment,
} from "../data/catchment.ts";
import type { BBox, FloodPointDef, PointState } from "../types.ts";

function rasterize(
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

function punchPit(elev: Float64Array, drain: Float64Array, nala: Uint8Array, r: number, c: number) {
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
      elev[j] -= 3.6 * Math.exp(-d2 / 2.2);
      drain[j] = BASE_DRAIN_M_HR;
    }
  }
  const cell = idx(r, c);
  nala[cell] = 0;
  drain[cell] = BASE_DRAIN_M_HR;
  let minN = elev[cell];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
      minN = Math.min(minN, elev[idx(rr, cc)]);
    }
  }
  elev[cell] = minN - 0.55;
}

export function upsample10to48(sample: number[], srcN: number): Float64Array {
  const out = new Float64Array(CELL_COUNT);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const y = (r / (ROWS - 1)) * (srcN - 1);
      const x = (c / (COLS - 1)) * (srcN - 1);
      const r0 = Math.floor(y);
      const c0 = Math.floor(x);
      const r1 = Math.min(srcN - 1, r0 + 1);
      const c1 = Math.min(srcN - 1, c0 + 1);
      const fy = y - r0;
      const fx = x - c0;
      const v00 = sample[r0 * srcN + c0];
      const v10 = sample[r0 * srcN + c1];
      const v01 = sample[r1 * srcN + c0];
      const v11 = sample[r1 * srcN + c1];
      out[idx(r, c)] =
        v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
    }
  }
  return out;
}

function spacedMinima(elev: Float64Array, count: number): { r: number; c: number }[] {
  const mins: { r: number; c: number; z: number }[] = [];
  for (let r = 2; r < ROWS - 2; r++) {
    for (let c = 2; c < COLS - 2; c++) {
      const z = elev[idx(r, c)];
      let low = true;
      for (let dr = -1; dr <= 1 && low; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          if (elev[idx(r + dr, c + dc)] < z) {
            low = false;
            break;
          }
        }
      }
      if (low) mins.push({ r, c, z });
    }
  }
  mins.sort((a, b) => a.z - b.z);
  const picked: { r: number; c: number }[] = [];
  for (const m of mins) {
    if (picked.length >= count) break;
    if (picked.some((p) => Math.hypot(p.r - m.r, p.c - m.c) < 5)) continue;
    picked.push({ r: m.r, c: m.c });
  }
  if (picked.length < count) {
    const all: { r: number; c: number; z: number }[] = [];
    for (let r = 2; r < ROWS - 2; r++) {
      for (let c = 2; c < COLS - 2; c++) all.push({ r, c, z: elev[idx(r, c)] });
    }
    all.sort((a, b) => a.z - b.z);
    for (const m of all) {
      if (picked.length >= count) break;
      if (picked.some((p) => Math.hypot(p.r - m.r, p.c - m.c) < 5)) continue;
      picked.push({ r: m.r, c: m.c });
    }
  }
  return picked;
}

export function buildCatchmentFromGrid(opts: {
  bbox: BBox;
  elev: Float64Array;
  cityName: string;
  language: string;
  catchmentId: string;
  seeds?: { name: string; lat: number; lng: number; kind?: PointState["kind"] }[];
  drainPaths?: [number, number][][];
  population?: number;
}): Catchment {
  const elev = new Float64Array(opts.elev);
  const drain = new Float64Array(CELL_COUNT);
  const nala = new Uint8Array(CELL_COUNT);
  drain.fill(BASE_DRAIN_M_HR);
  const drainPaths = opts.drainPaths ?? [];
  for (const path of drainPaths) {
    for (let k = 1; k < path.length; k++) {
      rasterize(
        nala,
        drain,
        latLngToCellIn(opts.bbox, path[k - 1][0], path[k - 1][1]),
        latLngToCellIn(opts.bbox, path[k][0], path[k][1]),
      );
    }
  }

  const defs: FloodPointDef[] = [];
  const used = new Set<number>();
  for (const s of opts.seeds ?? []) {
    const { r, c } = latLngToCellIn(opts.bbox, s.lat, s.lng);
    const cell = idx(r, c);
    if (used.has(cell)) continue;
    used.add(cell);
    defs.push({
      id: `seed-${defs.length}-${s.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      kind: s.kind ?? "underpass",
      language: opts.language,
      catchment: opts.catchmentId,
      households: 0,
      schools: 1,
      clinics: 1,
      underpasses: s.kind === "underpass" ? 1 : 0,
      ward: opts.cityName,
    });
  }
  if (defs.length < 8) {
    for (const m of spacedMinima(elev, 8)) {
      if (defs.length >= 8) break;
      const cell = idx(m.r, m.c);
      if (used.has(cell)) continue;
      used.add(cell);
      const ll = cellToLatLngIn(opts.bbox, m.r, m.c);
      defs.push({
        id: `low-${defs.length}`,
        name: `Low ground ${defs.length + 1}`,
        lat: ll.lat,
        lng: ll.lng,
        kind: "colony",
        language: opts.language,
        catchment: opts.catchmentId,
        households: 0,
        schools: 1,
        clinics: 0,
        underpasses: 0,
        ward: opts.cityName,
      });
    }
  }

  const pop = opts.population ?? 1_200_000;
  const per = Math.max(500, Math.round(pop / 900));
  const points: PointState[] = defs.slice(0, 8).map((p, i) => {
    const { r, c } = latLngToCellIn(opts.bbox, p.lat, p.lng);
    punchPit(elev, drain, nala, r, c);
    const cell = idx(r, c);
    return {
      id: p.id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      kind: p.kind,
      language: p.language,
      catchment: p.catchment,
      cell,
      elevM: elev[cell],
      depthM: 0,
      peakM: 0,
      onsetStep: null,
      manualRaise: false,
      households: Math.round(per * (0.7 + (i % 3) * 0.2)),
      schools: p.schools,
      clinics: p.clinics,
      underpasses: p.underpasses,
      ward: p.ward,
    };
  });

  return {
    rows: ROWS,
    cols: COLS,
    bbox: opts.bbox,
    elev,
    drain,
    nala,
    points,
    cellAreaM2: cellAreaFor(opts.bbox),
    drainPaths,
    cityName: opts.cityName,
  };
}
