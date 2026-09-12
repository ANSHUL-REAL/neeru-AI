import { CATCHMENT, FORECAST_STEPS, type Catchment } from "../data/catchment.ts";
import { OCT2020_REPORTED_FLOOD, OCT2020_SCALED_HOURLY_MM } from "../data/oct2020.ts";
import type { AgentId, ForecastResult, LiveRain, RainSourceId } from "../types.ts";
import type { GraphState } from "./agents.ts";
import { emptyGraph, orchestrate } from "./orchestrator.ts";
import { createAudit } from "./audit.ts";
import { rainForSource } from "./rainfall.ts";
import {
  createSolver,
  hourlyToSteps,
  runProfile,
  waterVolumeM3,
  type SolverState,
} from "./solver.ts";

export function runForecast(opts: {
  source: RainSourceId;
  live?: LiveRain | null;
  steps?: number;
  failAgent?: AgentId;
  disableDrainage?: boolean;
  catchment?: Catchment;
  extras?: Pick<GraphState, "roads" | "resources" | "shelters">;
  peakMmHr?: number;
}): ForecastResult {
  const rain = rainForSource(
    opts.source,
    opts.live ?? null,
    opts.steps ?? FORECAST_STEPS,
    opts.peakMmHr,
  );
  const series = opts.steps != null ? rain.series.slice(0, opts.steps) : rain.series;
  const state = runProfile(series, {
    disableDrainage: opts.disableDrainage,
    catchment: opts.catchment,
  });
  return finish(state, rain, series, opts.failAgent, opts.extras);
}

function finish(
  state: SolverState,
  rain: { mmPerHr: number; series: number[]; provenance: ForecastResult["rainfall"]["provenance"] },
  series: number[],
  failAgent?: AgentId,
  extras?: Pick<GraphState, "roads" | "resources" | "shelters">,
): ForecastResult {
  const log = createAudit();
  const graph = emptyGraph(
    state.points,
    {
      mmPerHr: rain.mmPerHr,
      series,
      provenance: rain.provenance,
    },
    extras,
  );
  const { reports, actions, verdict } = orchestrate(graph, log, { failAgent });
  return {
    points: state.points,
    depths: state.depth,
    reports,
    verdict,
    actions,
    audit: log,
    rainfall: {
      mmPerHr: rain.mmPerHr,
      series,
      provenance: rain.provenance,
    },
    steps: state.step,
    dtHours: 4 / 60,
    volumeStartM3: 0,
    volumeEndM3: waterVolumeM3(state.depth, state.catchment.cellAreaM2),
    volumeRainM3: state.volumeRainM3,
    volumeDrainM3: state.volumeDrainM3,
  };
}

export function runOct2020Backtest(): ForecastResult & {
  scores: { id: string; predicted: boolean; reported: boolean; hit: boolean }[];
} {
  const series = hourlyToSteps(OCT2020_SCALED_HOURLY_MM);
  const state = runProfile(series);
  const rain = rainForSource("oct2020", null, series.length);
  const result = finish(state, rain, series);
  const scores = result.points.map((p) => {
    const predicted = p.onsetStep !== null;
    const reported = OCT2020_REPORTED_FLOOD[p.id] ?? false;
    return { id: p.id, predicted, reported, hit: predicted === reported };
  });
  return { ...result, scores };
}

export function newIdleSolver() {
  return createSolver(CATCHMENT);
}
