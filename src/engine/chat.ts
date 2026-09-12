import type { ForecastResult } from "../types.ts";
import { DESK_MODEL } from "./brief.ts";
import { onsetMinutes } from "./solver.ts";

export type ChatMsg = { role: "user" | "assistant"; text: string };

export function chatContext(input: {
  city: string;
  you: string;
  rainMmHr: number;
  rainKind: string;
  flooded: { name: string; depthCm: number; minutes: number | null }[];
  clear: { name: string; depthCm: number }[];
  lastTrip: string | null;
  research?: { title: string; url: string }[];
}): string {
  return JSON.stringify(input);
}

export function fallbackHelp(ctx: {
  flooded: { name: string }[];
  clear: { name: string }[];
  you: string;
}): string {
  if (ctx.flooded.length === 0) {
    return `Stay where you are near ${ctx.you}. No watched point is activated. This is not an all-clear. Ask again if rain picks up.`;
  }
  const avoid = ctx.flooded.slice(0, 3).map((p) => p.name).join(", ");
  const go = ctx.clear[0]?.name;
  if (go) {
    return `Do not enter ${avoid}. From ${ctx.you}, go to ${go} next. That ground is still clear in the model.`;
  }
  return `Do not enter ${avoid}. Every watched point is wet. Move to higher ground away from those names.`;
}

export async function askHelp(
  question: string,
  history: ChatMsg[],
  ctx: string,
): Promise<string | null> {
  const body = {
    model: DESK_MODEL,
    messages: [
      {
        role: "system",
        content:
          "You are Neeru, a flood help desk. Answer in 2-4 short sentences. Tell the person what to do and where to go next using the named places in the JSON context. Research hits are live web pages from Exa, labelled reported. Never say a place is safe. Never invent streets. If they ask what to do, give one action. If they ask where to go, name a clear place from the list. No markdown. No em dash.",
      },
      { role: "user", content: `Context: ${ctx}` },
      ...history.slice(-6).map((m) => ({ role: m.role, content: m.text })),
      { role: "user", content: question },
    ],
    temperature: 0.2,
    max_tokens: 220,
  };
  const res = await fetch("/api/openrouter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res?.ok) return null;
  const json = (await res.json()) as { text?: string };
  return json.text?.trim() || null;
}

export function buildChatContext(
  cityName: string,
  you: string,
  result: ForecastResult,
  lastTrip: string | null,
  research: { title: string; url: string }[] = [],
): string {
  const flooded = result.points
    .filter((p) => p.onsetStep !== null)
    .map((p) => ({
      name: p.name,
      depthCm: Math.round(p.depthM * 100),
      minutes: onsetMinutes(p),
    }));
  const clear = result.points
    .filter((p) => p.onsetStep === null)
    .map((p) => ({ name: p.name, depthCm: Math.round(p.depthM * 100) }));
  return chatContext({
    city: cityName,
    you,
    rainMmHr: result.rainfall.mmPerHr,
    rainKind: result.rainfall.provenance.kind,
    flooded,
    clear,
    lastTrip,
    research,
  });
}

