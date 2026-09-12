export type ResearchHit = {
  title: string;
  url: string;
  snippet: string;
};

export type ExaSearchJson = {
  results?: Array<{
    title?: string;
    url?: string;
    text?: string;
    highlights?: string[];
  }>;
};

export function researchQuery(city: string): string {
  return `${city} urban flood inundation underpass nala waterlogging latest reports`;
}

export function parseExaResults(json: ExaSearchJson): ResearchHit[] {
  return (json.results ?? [])
    .filter((r) => r.url && r.title)
    .slice(0, 6)
    .map((r) => ({
      title: r.title as string,
      url: r.url as string,
      snippet: (r.highlights?.[0] || r.text || "").slice(0, 280),
    }));
}

export async function fetchCityResearch(city: string): Promise<ResearchHit[]> {
  const res = await fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: researchQuery(city) }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as ExaSearchJson;
  return parseExaResults(json);
}
