import { describe, expect, it } from "vitest";
import { parseGeocoding } from "../src/engine/city.ts";
import { upsample10to48 } from "../src/engine/terrain.ts";

describe("global city helpers", () => {
  it("parses Open-Meteo geocoding without inventing cities", () => {
    const cities = parseGeocoding({
      results: [
        {
          id: 1,
          name: "Jakarta",
          country: "Indonesia",
          country_code: "ID",
          latitude: -6.2,
          longitude: 106.8,
          population: 10000000,
        },
      ],
    });
    expect(cities).toHaveLength(1);
    expect(cities[0].name).toBe("Jakarta");
    expect(cities[0].lat).toBe(-6.2);
    expect(parseGeocoding({})).toEqual([]);
  });

  it("upsamples a 10x10 elevation grid to 48x48", () => {
    const sample = Array.from({ length: 100 }, (_, i) => i);
    const out = upsample10to48(sample, 10);
    expect(out.length).toBe(48 * 48);
    expect(out[0]).toBe(0);
  });
});
