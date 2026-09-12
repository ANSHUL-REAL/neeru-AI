import type { AuditEvent } from "../types.ts";

export function createAudit(): AuditEvent[] {
  return [];
}

export function appendAudit(
  log: AuditEvent[],
  event: Omit<AuditEvent, "seq">,
): AuditEvent {
  const row: AuditEvent = { seq: log.length + 1, ...event };
  log.push(row);
  return row;
}

export function reconstruct(log: AuditEvent[]): AuditEvent[] {
  return log.slice();
}
