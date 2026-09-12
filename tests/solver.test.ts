import { describe, expect, it } from "vitest";
import { CATCHMENT } from "../src/data/catchment.ts";
import { FLOOD_POINTS } from "../src/data/floodPoints.ts";
import {
  addUniformDepth,
  constantSeries,
  createSolver,
  runProfile,
  stepSolver,
  waterVolumeM3,
} from "../src/engine/solver.ts";
import { FORECAST_STEPS } from "../src/data/catchment.ts";

describe("hydrological solver", () => {
  it("conserves volume within 1% over 500 steps with drainage disabled", () => {
    const state = createSolver();
    addUniformDepth(state, 0.25);
    const v0 = waterVolumeM3(state.depth);
    expect(v0).toBeGreaterThan(0);
    for (let i = 0; i < 500; i++) {
      stepSolver(state, 0, { disableDrainage: true });
    }
    const v1 = waterVolumeM3(state.depth);
    const rel = Math.abs(v1 - v0) / v0;
    expect(rel).toBeLessThan(0.01);
    for (const d of state.depth) expect(d).toBeGreaterThanOrEqual(0);
  });

  it("activates flood points in terrain order, not registry order", () => {
    const series = constantSeries(68, FORECAST_STEPS);
    const state = runProfile(series);
    const onset = state.points
      .filter((p) => p.onsetStep !== null)
      .sort((a, b) => (a.onsetStep ?? 0) - (b.onsetStep ?? 0));
    expect(onset.length).toBeGreaterThan(1);
    const registry = FLOOD_POINTS.map((p) => p.id);
    const order = onset.map((p) => p.id);
    expect(order).not.toEqual(registry);
    const again = runProfile(series)
      .points.filter((p) => p.onsetStep !== null)
      .sort((a, b) => (a.onsetStep ?? 0) - (b.onsetStep ?? 0))
      .map((p) => p.id);
    expect(again).toEqual(order);
    const first = onset[0];
    const last = onset[onset.length - 1];
    expect(CATCHMENT.elev[first.cell]).not.toBe(CATCHMENT.elev[last.cell]);
  });

  it("records onset once and does not clear it when depth recedes", () => {
    const state = createSolver();
    for (let i = 0; i < 40; i++) stepSolver(state, 90);
    const wet = state.points.filter((p) => p.onsetStep !== null);
    expect(wet.length).toBeGreaterThan(0);
    const snapshot = wet.map((p) => ({ id: p.id, onset: p.onsetStep }));
    for (let i = 0; i < 80; i++) stepSolver(state, 0);
    for (const s of snapshot) {
      const p = state.points.find((x) => x.id === s.id);
      expect(p?.onsetStep).toBe(s.onset);
    }
  });
});
