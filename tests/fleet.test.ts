import { describe, expect, it } from "vitest";
import { FORECAST_STEPS } from "../src/data/catchment.ts";
import { AGENT_ORDER, AGENT_TITLES } from "../src/engine/agents.ts";
import { commitAction, emitOutbound } from "../src/engine/authority.ts";
import { runForecast, runOct2020Backtest } from "../src/engine/forecast.ts";
import { OPEN_METEO_FORECAST_URL } from "../src/engine/rainfall.ts";
import { parseOpenMeteoForecast, precipitationToMmPerHr } from "../src/engine/rainfall.ts";

describe("agents, orchestrator, authority", () => {
  it("issues zero warnings and logs silence at 20 mm/hr", () => {
    const result = runForecast({ source: "mm20", steps: FORECAST_STEPS });
    expect(result.verdict.silence).toBe(true);
    expect(result.verdict.silenceLogged).toBe(true);
    expect(result.actions.filter((a) => a.kind === "warning")).toHaveLength(0);
    expect(result.verdict.count).toBe(0);
    expect(result.audit.some((e) => e.type === "silence")).toBe(true);
    expect(result.verdict.text.toLowerCase()).not.toContain("safe");
    expect(result.reports).toHaveLength(8);
  });

  it("runs a storm fixture so the demo is not silent", () => {
    const result = runForecast({ source: "storm", peakMmHr: 95, steps: FORECAST_STEPS });
    expect(result.verdict.silence).toBe(false);
    expect(result.verdict.count).toBeGreaterThan(0);
    expect(result.actions.length).toBeGreaterThan(0);
    expect(result.rainfall.mmPerHr).toBe(95);
  });

  it("runs all eight named agents from solver state at 68 mm/hr", () => {
    const result = runForecast({ source: "mm68", steps: FORECAST_STEPS });
    expect(result.verdict.silence).toBe(false);
    expect(result.reports).toHaveLength(8);
    const ids = result.reports.map((r) => r.id);
    expect(ids).toEqual(AGENT_ORDER);
    for (const id of AGENT_ORDER) {
      const r = result.reports.find((x) => x.id === id);
      expect(r, id).toBeTruthy();
      expect(r?.title).toBe(AGENT_TITLES[id]);
      expect(r?.status).not.toBe("failed");
      expect(r?.finding).not.toBeUndefined();
      if (r?.status === "null") {
        expect(r.finding).toMatchObject({ type: "null" });
      }
    }
    const hydro = result.reports.find((r) => r.id === "hydrology");
    expect(hydro?.status).toBe("ok");
    const activations = (hydro?.finding as { activations: unknown[] }).activations;
    expect(activations.length).toBeGreaterThan(0);
    expect(result.verdict.onset).toBeTruthy();
    expect(result.verdict.count).toBeGreaterThan(0);
    expect(result.verdict.deepest).toBeTruthy();
    expect(result.verdict.exposure.households).toBeGreaterThan(0);
    expect(result.verdict.actions.length).toBeGreaterThan(0);
    expect(result.verdict.text).toContain(result.verdict.onset!.name);
    expect(result.verdict.text.toLowerCase()).toContain("onset");
    expect(result.verdict.text.toLowerCase()).toContain("deepest");
  });

  it("keeps seven agents reporting when one is forced to fail", () => {
    const result = runForecast({
      source: "mm68",
      steps: FORECAST_STEPS,
      failAgent: "alert",
    });
    expect(result.reports).toHaveLength(8);
    const failed = result.reports.filter((r) => r.status === "failed");
    expect(failed).toHaveLength(1);
    expect(failed[0].id).toBe("alert");
    const others = result.reports.filter((r) => r.id !== "alert");
    expect(others).toHaveLength(7);
    for (const r of others) expect(r.status).not.toBe("failed");
  });

  it("runs the Oct 2020 headless backtest and scores each point", () => {
    const result = runOct2020Backtest();
    expect(result.scores).toHaveLength(8);
    for (const s of result.scores) {
      expect(s).toHaveProperty("id");
      expect(s).toHaveProperty("predicted");
      expect(s).toHaveProperty("reported");
      expect(s).toHaveProperty("hit");
    }
    expect(result.points).toHaveLength(8);
    expect(result.rainfall.provenance.source).toMatch(/Open-Meteo/);
  });

  it("refuses irreversible actions without operator approval and never sends", () => {
    const result = runForecast({ source: "mm68", steps: FORECAST_STEPS });
    const action = result.actions[0];
    expect(action).toBeTruthy();
    const observer = commitAction(action, {
      role: "observer",
      actor: "watch-desk",
      log: result.audit,
    });
    expect(observer.ok).toBe(false);
    expect(observer.sent).toBe(false);
    expect(observer.queued).toBe(false);
    expect(result.audit.some((e) => e.type === "refusal")).toBe(true);

    const copy = { ...result.actions[1] ?? action, status: "proposed" as const };
    const op = commitAction(copy, {
      role: "operator",
      actor: "control-1",
      log: result.audit,
    });
    expect(op.ok).toBe(true);
    expect(op.sent).toBe(false);
    expect(op.queued).toBe(true);
    expect(result.audit.some((e) => e.type === "approval")).toBe(true);
    expect(() => emitOutbound(copy)).toThrow(/No outbound path/);
  });

  it("parses live Open-Meteo JSON without inventing rainfall", () => {
    expect(OPEN_METEO_FORECAST_URL).toContain("api.open-meteo.com");
    expect(precipitationToMmPerHr(1.5, 900)).toBe(6);
    const live = parseOpenMeteoForecast({
      current: { time: "2026-09-12T14:00", interval: 900, precipitation: 0, rain: 0 },
      hourly: { time: ["2026-09-12T14:00"], precipitation: [0] },
    });
    expect(live.mmPerHr).toBe(0);
    expect(live.source).toMatch(/Open-Meteo/);
    expect(live.degraded).toBe(false);
  });
});
