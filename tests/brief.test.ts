import { describe, expect, it } from "vitest";
import { deskPayload, explainOpenRouterError, parseDeskReply } from "../src/engine/brief.ts";
import { runForecast } from "../src/engine/forecast.ts";
import { FORECAST_STEPS } from "../src/data/catchment.ts";

describe("OpenRouter desk copy", () => {
  it("parses a JSON brief and ignores wrapping text", () => {
    const parsed = parseDeskReply(`Here you go
{"operator":"Onset at Low ground 1 in 40 min, 62 cm modelled. Stage crew A now.","field":"Stage at Low ground 1.","why":"This pit sits below the drain invert.","sms":"Low ground 1: 62 cm in 40 min. Leave the road."}
thanks`);
    expect(parsed?.operator).toContain("Low ground 1");
    expect(parsed?.sms).toContain("62 cm");
    expect(parseDeskReply("not json")).toBeNull();
  });

  it("explains auth failures without swallowing them", () => {
    expect(explainOpenRouterError(401, "User not found.")).toMatch(/rejected/i);
    expect(explainOpenRouterError(501, "")).toMatch(/Connect/i);
  });

  it("sends modelled numbers into the payload, not invented ones", () => {
    const result = runForecast({ source: "mm68", steps: FORECAST_STEPS });
    const payload = deskPayload("Jakarta", "id", result);
    expect(payload.city).toBe("Jakarta");
    expect(payload.language).toBe("id");
    expect(payload.rainMmHr).toBe(68);
    expect(payload.silence).toBe(false);
    expect(payload.deepest?.depthCm).toBe(result.verdict.deepest?.depthCm);
    expect(payload.points.length).toBeGreaterThan(0);
  });
});
