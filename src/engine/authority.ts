import type { ProposedAction, Role } from "../types.ts";
import { appendAudit } from "./audit.ts";
import type { AuditEvent } from "../types.ts";

export type CommitResult = {
  ok: boolean;
  sent: false;
  queued: boolean;
  reason: string;
  action: ProposedAction;
};

export function commitAction(
  action: ProposedAction,
  opts: { role: Role; actor: string; log: AuditEvent[] },
): CommitResult {
  if (opts.role !== "operator") {
    action.status = "refused";
    appendAudit(opts.log, {
      at: new Date().toISOString(),
      type: "refusal",
      actor: opts.actor,
      detail: `${opts.role} cannot commit ${action.kind} ${action.id}`,
      payload: { actionId: action.id, role: opts.role },
    });
    return {
      ok: false,
      sent: false,
      queued: false,
      reason: "observer cannot commit",
      action,
    };
  }
  action.status = "approved";
  appendAudit(opts.log, {
    at: new Date().toISOString(),
    type: "approval",
    actor: opts.actor,
    detail: `Approved ${action.kind}: ${action.title}. Queued. Not sent.`,
    payload: { actionId: action.id, sent: false },
  });
  return {
    ok: true,
    sent: false,
    queued: true,
    reason: "queued pending authorised channel (Phase 3)",
    action,
  };
}

export function refuseAction(
  action: ProposedAction,
  opts: { role: Role; actor: string; log: AuditEvent[] },
): CommitResult {
  action.status = "refused";
  appendAudit(opts.log, {
    at: new Date().toISOString(),
    type: "refusal",
    actor: opts.actor,
    detail: `Refused ${action.kind}: ${action.title}`,
    payload: { actionId: action.id },
  });
  return {
    ok: true,
    sent: false,
    queued: false,
    reason: "refused by operator",
    action,
  };
}

export function emitOutbound(_action: ProposedAction): never {
  throw new Error("No outbound path in Phase 1");
}
