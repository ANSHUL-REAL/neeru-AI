import { describe, expect, it } from "vitest";
import { parseExaResults, researchQuery } from "../src/engine/research.ts";

describe("Exa city research", () => {
  it("builds a flood research query from the city name", () => {
    expect(researchQuery("Jakarta")).toMatch(/Jakarta/);
    expect(researchQuery("Jakarta")).toMatch(/flood/i);
  });

  it("parses Exa hits without inventing URLs", () => {
    const hits = parseExaResults({
      results: [
        {
          title: "Jakarta floods again",
          url: "https://example.com/jkt",
          highlights: ["Kampung Melayu under water"],
        },
        { title: "skip me" },
      ],
    });
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toBe("https://example.com/jkt");
    expect(hits[0].snippet).toMatch(/Kampung/);
  });
});
