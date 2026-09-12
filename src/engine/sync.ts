import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuditEvent, ProposedAction } from "../types.ts";

export type DeskKeys = { url: string; anon: string };

export function readKeys(): DeskKeys | null {
  const url =
    (typeof localStorage !== "undefined" && localStorage.getItem("neeru.supabase.url")) ||
    (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
    "";
  const anon =
    (typeof localStorage !== "undefined" && localStorage.getItem("neeru.supabase.anon")) ||
    (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
    "";
  if (!url || !anon) return null;
  return { url, anon };
}

export function clientFrom(keys: DeskKeys): SupabaseClient {
  return createClient(keys.url, keys.anon);
}

export async function probeSupabase(keys: DeskKeys): Promise<string> {
  const sb = clientFrom(keys);
  const { error } = await sb.from("desks").select("id").limit(1);
  if (!error) return "connected";
  if (error.message.toLowerCase().includes("could not find the table")) {
    return "Run neeru/supabase/schema.sql in the Supabase SQL editor, then refresh.";
  }
  return error.message;
}

export async function persistDesk(
  keys: DeskKeys,
  row: {
    city: string;
    lat: number;
    lng: number;
    verdict: string;
    rainMmHr: number;
    actions: ProposedAction[];
    audit: AuditEvent[];
  },
): Promise<{ id: string | null; error: string | null }> {
  const sb = clientFrom(keys);
  const { data, error } = await sb
    .from("desks")
    .insert({
      city: row.city,
      lat: row.lat,
      lng: row.lng,
      verdict: row.verdict,
      rain_mm_hr: row.rainMmHr,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { id: null, error: error?.message ?? "desk insert failed" };
  }
  const deskId = data.id as string;
  if (row.audit.length) {
    const { error: auditErr } = await sb.from("audit").insert(
      row.audit.map((e) => ({
        desk_id: deskId,
        seq: e.seq,
        type: e.type,
        actor: e.actor,
        detail: e.detail,
        payload: e.payload ?? null,
      })),
    );
    if (auditErr) return { id: deskId, error: auditErr.message };
  }
  if (row.actions.length) {
    const { error: actErr } = await sb.from("actions").insert(
      row.actions.map((a) => ({
        id: `${deskId}:${a.id}`,
        desk_id: deskId,
        kind: a.kind,
        title: a.title,
        instruction: a.instruction,
        status: a.status,
      })),
    );
    if (actErr) return { id: deskId, error: actErr.message };
  }
  return { id: deskId, error: null };
}

export async function persistAction(
  keys: DeskKeys,
  deskId: string,
  action: ProposedAction,
) {
  const sb = clientFrom(keys);
  await sb.from("actions").upsert({
    id: `${deskId}:${action.id}`,
    desk_id: deskId,
    kind: action.kind,
    title: action.title,
    instruction: action.instruction,
    status: action.status,
  });
}
