import type { ForecastResult } from "../types.ts";
import { onsetMinutes } from "./solver.ts";

export const DESK_MODEL = "openai/gpt-4o-mini";

const SYSTEM = `You are a flood-desk writer. Reply with JSON only, no markdown.
Keys:
- operator: two sentences in English for the person at the console. Sentence 1: place, modelled depth, minutes. Sentence 2: the single action now.
- field: one instruction for a crew on a phone, in the given language if possible, else English.
- why: one sentence on why that place ponds, using only the given terrain and rain facts. No new numbers.
- sms: one line a resident could receive. Locality, modelled depth, minutes, one action. Same language as field.
Rules: never say a place is safe. never invent numbers. never use an em dash. If silence is true, operator and field must say rain is below the warning threshold and this is not an all-clear. sms may be empty in that case.`;

export type DeskCopy = {
  operator: string;
  field: string;
  why: string;
  sms: string;
  source: string;
  model: string;
};

export function deskPayload(
  cityName: string,
  language: string,
  result: ForecastResult,
) {
  const top = result.points
    .slice()
    .sort((a, b) => (a.onsetStep ?? 1e9) - (b.onsetStep ?? 1e9))
    .slice(0, 4)
    .map((p) => ({
      name: p.name,
      kind: p.kind,
      elevM: Math.round(p.elevM * 10) / 10,
      depthCm: Math.round(p.depthM * 100),
      onsetMin: onsetMinutes(p),
      households: p.households,
    }));
  return {
    city: cityName,
    language,
    rainMmHr: result.rainfall.mmPerHr,
    rainKind: result.rainfall.provenance.kind,
    rainSource: result.rainfall.provenance.source,
    silence: result.verdict.silence,
    onset: result.verdict.onset,
    count: result.verdict.count,
    deepest: result.verdict.deepest,
    exposure: result.verdict.exposure,
    topAction: result.actions[0]?.instruction ?? null,
    points: top,
  };
}

export function parseDeskReply(raw: string): Omit<DeskCopy, "source" | "model"> | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    const operator = String(obj.operator ?? "").trim();
    if (!operator) return null;
    return {
      operator,
      field: String(obj.field ?? "").trim(),
      why: String(obj.why ?? "").trim(),
      sms: String(obj.sms ?? "").trim(),
    };
  } catch {
    return null;
  }
}

export function hasBrowserOpenRouterKey(): boolean {
  if (typeof localStorage !== "undefined" && localStorage.getItem("neeru.openrouter")) return true;
  return Boolean(import.meta.env.VITE_OPENROUTER_API_KEY);
}

function browserKey(): string {
  return (
    (typeof localStorage !== "undefined" && localStorage.getItem("neeru.openrouter")) ||
    (import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined) ||
    ""
  );
}

export function explainOpenRouterError(status: number, body: string): string {
  const lower = body.toLowerCase();
  if (status === 401 || lower.includes("user not found") || lower.includes("unauthorized")) {
    return "OpenRouter key was rejected. Paste a valid key in Connect.";
  }
  if (status === 402 || lower.includes("credits") || lower.includes("payment")) {
    return "OpenRouter is out of credits.";
  }
  if (status === 429) return "OpenRouter is rate-limited. Wait a few seconds.";
  if (status === 501) return "No OpenRouter key on the server. Paste one in Connect.";
  return body.slice(0, 180) || `OpenRouter HTTP ${status}`;
}

export async function probeOpenRouter(): Promise<boolean> {
  if (hasBrowserOpenRouterKey()) return true;
  try {
    const res = await fetch("/api/openrouter", { method: "GET" });
    if (!res.ok) return false;
    const json = (await res.json()) as { configured?: boolean };
    return Boolean(json.configured);
  } catch {
    return false;
  }
}

export async function requestDeskCopy(
  cityName: string,
  language: string,
  result: ForecastResult,
): Promise<{ copy: DeskCopy | null; error: string | null }> {
  const payload = deskPayload(cityName, language, result);
  const body = {
    model: DESK_MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify(payload) },
    ],
    temperature: 0.2,
    max_tokens: 420,
    response_format: { type: "json_object" },
  };

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = browserKey();
  if (key) headers["x-openrouter-key"] = key;

  const local = await fetch("/api/openrouter", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }).catch(() => null);

  if (local) {
    const json = (await local.json().catch(() => ({}))) as {
      text?: string;
      error?: string;
    };
    if (local.ok && json.text) {
      const parsed = parseDeskReply(json.text);
      if (parsed) {
        return {
          copy: { ...parsed, source: "OpenRouter", model: DESK_MODEL },
          error: null,
        };
      }
      return {
        copy: {
          operator: json.text.trim(),
          field: "",
          why: "",
          sms: "",
          source: "OpenRouter",
          model: DESK_MODEL,
        },
        error: null,
      };
    }
    if (local.status !== 501) {
      return { copy: null, error: explainOpenRouterError(local.status, json.error ?? "") };
    }
  }

  if (!key) return { copy: null, error: "Paste an OpenRouter key in Connect." };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": typeof location !== "undefined" ? location.origin : "http://localhost",
      "X-Title": "Neeru",
    },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  if (!res.ok) return { copy: null, error: explainOpenRouterError(res.status, raw) };
  let text = "";
  try {
    const json = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
    text = json.choices?.[0]?.message?.content ?? "";
  } catch {
    text = raw;
  }
  const parsed = parseDeskReply(text);
  if (parsed) return { copy: { ...parsed, source: "OpenRouter", model: DESK_MODEL }, error: null };
  if (text.trim()) {
    return {
      copy: { operator: text.trim(), field: "", why: "", sms: "", source: "OpenRouter", model: DESK_MODEL },
      error: null,
    };
  }
  return { copy: null, error: "OpenRouter returned an empty brief." };
}

export async function requestTripWarning(input: {
  from: string;
  to: string;
  km: number;
  minutes: number;
  flooded: string[];
  via: string | null;
}): Promise<string | null> {
  const body = {
    model: DESK_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Write 2 short sentences for a person about to drive. Sentence 1: Go from A to B, distance and minutes. Sentence 2: if flooded places are listed, say do not enter them and name the via if given. Never say a place is safe. Never invent numbers. No markdown. No em dash.",
      },
      { role: "user", content: JSON.stringify(input) },
    ],
    temperature: 0.2,
    max_tokens: 160,
  };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const key = browserKey();
  if (key) headers["x-openrouter-key"] = key;
  const local = await fetch("/api/openrouter", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  }).catch(() => null);
  if (local?.ok) {
    const json = (await local.json()) as { text?: string };
    if (json.text?.trim()) return json.text.trim();
  }
  return null;
}
