type VercelReq = {
  method?: string;
  body?: { query?: string };
};
type VercelRes = {
  status: (n: number) => VercelRes;
  json: (b: unknown) => void;
  setHeader: (k: string, v: string) => void;
};

export default async function handler(req: VercelReq, res: VercelRes) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const key = process.env.EXA_API_KEY || process.env.VITE_EXA_API_KEY;
  if (!key) {
    res.status(501).json({ error: "EXA_API_KEY missing", results: [] });
    return;
  }
  const query = req.body?.query?.trim();
  if (!query) {
    res.status(400).json({ error: "query required", results: [] });
    return;
  }
  const upstream = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      query,
      type: "auto",
      numResults: 6,
      contents: { highlights: true },
    }),
  });
  const json = await upstream.json();
  res.status(upstream.ok ? 200 : upstream.status).json(json);
}
