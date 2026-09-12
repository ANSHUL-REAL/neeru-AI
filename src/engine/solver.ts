import {
  ACTIVATION_M,
  CATCHMENT,
  CELL_AREA_M2,
  CELL_COUNT,
  COLS,
  DT_HOURS,
  ROWS,
  type Catchment,
} from "../data/catchment.ts";
import type { PointState } from "../types.ts";

const STABILITY = 0.22;
const DIRS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export type SolverState = {
  catchment: Catchment;
  depth: Float64Array;
  points: PointState[];
  step: number;
  volumeRainM3: number;
  volumeDrainM3: number;
};

export function clonePoints(src: PointState[]): PointState[] {
  return src.map((p) => ({ ...p }));
}

export function createSolver(catchment: Catchment = CATCHMENT): SolverState {
  return {
    catchment,
    depth: new Float64Array(CELL_COUNT),
    points: clonePoints(catchment.points),
    step: 0,
    volumeRainM3: 0,
    volumeDrainM3: 0,
  };
}

export function waterVolumeM3(depth: Float64Array, cellAreaM2 = CELL_AREA_M2): number {
  let s = 0;
  for (let i = 0; i < depth.length; i++) s += depth[i];
  return s * cellAreaM2;
}

export function addUniformDepth(state: SolverState, meters: number) {
  for (let i = 0; i < state.depth.length; i++) state.depth[i] += meters;
}

function neighborIndex(r: number, c: number, dr: number, dc: number): number {
  const rr = r + dr;
  const cc = c + dc;
  if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) return -1;
  return rr * COLS + cc;
}

export function stepSolver(
  state: SolverState,
  rainMmPerHr: number,
  opts?: { disableDrainage?: boolean },
): void {
  const { elev, drain } = state.catchment;
  const depth = state.depth;
  const rainM = (rainMmPerHr / 1000) * DT_HOURS;
  if (rainM > 0) {
    for (let i = 0; i < depth.length; i++) depth[i] += rainM;
    state.volumeRainM3 += rainM * CELL_COUNT * (state.catchment.cellAreaM2 ?? CELL_AREA_M2);
  }

  if (!opts?.disableDrainage) {
    for (let i = 0; i < depth.length; i++) {
      const take = Math.min(depth[i], drain[i] * DT_HOURS);
      depth[i] -= take;
      state.volumeDrainM3 += take * (state.catchment.cellAreaM2 ?? CELL_AREA_M2);
    }
  }

  const next = new Float64Array(depth);
  const diffs = new Float64Array(8);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      const d = depth[i];
      if (d <= 1e-12) continue;
      const head = elev[i] + d;
      let sum = 0;
      let n = 0;
      for (let k = 0; k < 8; k++) {
        const j = neighborIndex(r, c, DIRS[k][0], DIRS[k][1]);
        if (j < 0) {
          diffs[k] = 0;
          continue;
        }
        const nhead = elev[j] + depth[j];
        const diff = head - nhead;
        if (diff > 0) {
          diffs[k] = diff;
          sum += diff;
          n++;
        } else {
          diffs[k] = 0;
        }
      }
      if (n === 0 || sum <= 0) continue;
      const maxOut = d * STABILITY;
      for (let k = 0; k < 8; k++) {
        if (diffs[k] <= 0) continue;
        const j = neighborIndex(r, c, DIRS[k][0], DIRS[k][1]);
        const share = maxOut * (diffs[k] / sum);
        next[i] -= share;
        next[j] += share;
      }
    }
  }

  for (let i = 0; i < next.length; i++) {
    depth[i] = next[i] < 0 ? 0 : next[i];
  }

  state.step += 1;
  for (const p of state.points) {
    const d = depth[p.cell];
    p.depthM = d;
    if (d > p.peakM) p.peakM = d;
    if (p.onsetStep === null && d >= ACTIVATION_M) p.onsetStep = state.step;
  }
}

export function raisePoint(state: SolverState, pointId: string): PointState | null {
  const p = state.points.find((x) => x.id === pointId);
  if (!p) return null;
  p.manualRaise = true;
  if (p.onsetStep === null) p.onsetStep = state.step === 0 ? 1 : state.step;
  return p;
}

export function runProfile(
  seriesMmPerHr: number[],
  opts?: { disableDrainage?: boolean; catchment?: Catchment },
): SolverState {
  const state = createSolver(opts?.catchment);
  for (const mm of seriesMmPerHr) {
    stepSolver(state, mm, { disableDrainage: opts?.disableDrainage });
  }
  return state;
}

export function constantSeries(mmPerHr: number, steps: number): number[] {
  return Array.from({ length: steps }, () => mmPerHr);
}

export function hourlyToSteps(hourlyMm: number[], stepsPerHour = Math.round(1 / DT_HOURS)): number[] {
  const out: number[] = [];
  for (const mm of hourlyMm) {
    for (let i = 0; i < stepsPerHour; i++) out.push(mm);
  }
  return out;
}

export function onsetMinutes(point: PointState): number | null {
  if (point.onsetStep === null) return null;
  return Math.round(point.onsetStep * DT_HOURS * 60);
}
