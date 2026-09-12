import { readKeys } from "./sync.ts";

export type LogKind = "trip" | "chat" | "storm" | "city";

export type LogRow = {
  id: string;
  at: string;
  kind: LogKind;
  title: string;
  detail: string;
};

const KEY = "neeru.call-log";

export function loadLog(): LogRow[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LogRow[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendLog(kind: LogKind, title: string, detail: string): LogRow {
  const row: LogRow = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
    kind,
    title,
    detail,
  };
  const next = [row, ...loadLog()].slice(0, 80);
  localStorage.setItem(KEY, JSON.stringify(next));
  const keys = readKeys();
  if (keys) {
    void fetch(`${keys.url}/rest/v1/call_log`, {
      method: "POST",
      headers: {
        apikey: keys.anon,
        Authorization: `Bearer ${keys.anon}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        id: row.id,
        kind: row.kind,
        title: row.title,
        detail: row.detail,
        created_at: row.at,
      }),
    }).catch(() => undefined);
  }
  return row;
}
