import { describe, expect, it } from "vitest";
import { haversineM, pointsOnRoute } from "../src/engine/route.ts";
import type { PointState } from "../src/types.ts";

function pt(id: string, lat: number, lng: number, on: boolean): PointState {
  return {
    id,
    name: id,
    lat,
    lng,
    kind: "underpass",
    language: "en",
    catchment: "x",
    cell: 0,
    elevM: 10,
    depthM: on ? 0.5 : 0,
    peakM: on ? 0.5 : 0,
    onsetStep: on ? 4 : null,
    manualRaise: false,
    households: 100,
    schools: 0,
    clinics: 0,
    underpasses: 1,
    ward: "x",
  };
}

describe("trip routing helpers", () => {
  it("flags a flood point that sits on the line", () => {
    const line: [number, number][] = [
      [17.4, 78.4],
      [17.41, 78.41],
      [17.42, 78.42],
    ];
    const on = pt("mid", 17.41, 78.41, true);
    const off = pt("far", 17.5, 78.5, true);
    const hits = pointsOnRoute([on, off], line, 400);
    expect(hits.map((p) => p.id)).toEqual(["mid"]);
  });

  it("measures distance in metres", () => {
    const d = haversineM({ lat: 17.4, lng: 78.4 }, { lat: 17.4, lng: 78.4 });
    expect(d).toBe(0);
    expect(haversineM({ lat: 17.4, lng: 78.4 }, { lat: 17.41, lng: 78.4 })).toBeGreaterThan(1000);
  });
});
