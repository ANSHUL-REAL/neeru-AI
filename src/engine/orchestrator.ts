import { DT_HOURS } from "../data/catchment.ts";
import type {
  AgentId,
  AgentReport,
  AuditEvent,
  PointState,
  ProposedAction,
  Provenance,
  Verdict,
} from "../types.ts";
import { runAgentFleet, type GraphState } from "./agents.ts";
import { appendAudit } from "./audit.ts";
import { onsetMinutes } from "./solver.ts";

const WARNING_BUDGET = 8;

function priorityFor(kind: ProposedAction["kind"], point: PointState | undefined): number {
  if (kind === "closure" && point?.kind === "underpass") return 10;
  if (kind === "dispatch") return 9;
  if (kind === "warning") return 8;
  if (kind === "closure") return 7;
  if (kind === "shelter") return 6;
  return 3;
}

function buildActions(graph: GraphState): ProposedAction[] {
  const actions: ProposedAction[] = [];
  const closures = (graph.route?.closures as Array<Record<string, unknown>> | undefined) ?? [];
  for (const c of closures) {
    const point = graph.points.find((p) => p.id === c.pointId);
    const kind = "closure" as const;
    actions.push({
      id: `close-${c.pointId}`,
      kind,
      title: `Close ${c.name}`,
      instruction: `Close ${c.name} now. Divert via ${c.alternate}. Water ${c.onsetMin} min out.`,
      pointId: String(c.pointId),
      priority: priorityFor(kind, point),
      leadMinutes: Number(c.issueMin) ?? 0,
      status: "proposed",
      evidence: `Onset ${c.onsetMin} min modelled at ${c.name}`,
    });
  }
  const assignments = (graph.dispatch?.assignments as Array<Record<string, unknown>> | undefined) ?? [];
  for (const a of assignments) {
    const point = graph.points.find((p) => p.id === a.pointId);
    actions.push({
      id: `dispatch-${a.pointId}`,
      kind: "dispatch",
      title: `Stage ${a.unitName}`,
      instruction: String(a.instruction),
      pointId: String(a.pointId),
      priority: priorityFor("dispatch", point),
      leadMinutes: Number(a.leadMin) ?? 0,
      status: "proposed",
      evidence: `Nearest unit ${a.km} km`,
    });
  }
  const warnings = (graph.alert?.warnings as Array<Record<string, unknown>> | undefined) ?? [];
  let warnCount = 0;
  for (const w of warnings) {
    if (warnCount >= WARNING_BUDGET) break;
    const point = graph.points.find((p) => p.id === w.pointId);
    warnCount += 1;
    actions.push({
      id: `warn-${w.pointId}`,
      kind: "warning",
      title: `Warn ${w.locality}`,
      instruction: String(w.instruction),
      pointId: String(w.pointId),
      priority: priorityFor("warning", point),
      leadMinutes: Number(w.minutes) ?? 0,
      status: "proposed",
      evidence: `${w.recipients} households modelled, ${w.language}`,
    });
  }
  const openings = (graph.shelter?.openings as Array<Record<string, unknown>> | undefined) ?? [];
  if (openings.length) {
    actions.push({
      id: "shelter-open",
      kind: "shelter",
      title: `Open ${openings.length} shelters`,
      instruction: `Open ${openings.map((o) => o.name).join(", ")}. Walking routes avoid predicted polygons.`,
      pointId: null,
      priority: 6,
      leadMinutes: 30,
      status: "proposed",
      evidence: `${graph.shelter?.capacity ?? 0} capacity modelled`,
    });
  }
  actions.sort((a, b) => b.priority - a.priority);
  return actions;
}

export function composeVerdict(
  points: PointState[],
  reports: AgentReport[],
  actions: ProposedAction[],
): Verdict {
  const active = points
    .filter((p) => p.onsetStep !== null || p.manualRaise)
    .slice()
    .sort((a, b) => (a.onsetStep ?? 1e9) - (b.onsetStep ?? 1e9));
  const hydroNull = reports.find((r) => r.id === "hydrology" && r.status === "null");
  if (active.length === 0 || hydroNull) {
    return {
      text: "No activation predicted. Rain is below network capacity. No warnings issued. This is not an all-clear.",
      onset: null,
      count: 0,
      deepest: null,
      exposure: { households: 0, schools: 0, clinics: 0, underpasses: 0 },
      actions: [],
      silence: true,
      silenceLogged: true,
    };
  }
  const first = active[0];
  const deepest = points.reduce((m, p) => (p.depthM > m.depthM ? p : m), points[0]);
  const exposure = (reports.find((r) => r.id === "exposure")?.finding ?? {}) as {
    households?: number;
    schools?: number;
    clinics?: number;
    underpasses?: number;
  };
  const households = exposure.households ?? 0;
  const schools = exposure.schools ?? 0;
  const clinics = exposure.clinics ?? 0;
  const underpasses = exposure.underpasses ?? 0;
  const minutes = onsetMinutes(first) ?? Math.round((first.onsetStep ?? 0) * DT_HOURS * 60);
  const depthCm = Math.round(deepest.depthM * 100);
  const actionTitles = actions.map((a) => a.title);
  const text = `Onset at ${first.name} in ${minutes} min, ${active.length} points, deepest ${depthCm} cm modelled at ${deepest.name}, ${households} households / ${schools} schools / ${clinics} clinics / ${underpasses} underpasses. Commit: ${actionTitles.join("; ") || "none"}.`;
  return {
    text,
    onset: { pointId: first.id, name: first.name, minutes },
    count: active.length,
    deepest: { pointId: deepest.id, name: deepest.name, depthCm },
    exposure: { households, schools, clinics, underpasses },
    actions: actions.map((a) => ({ id: a.id, kind: a.kind, title: a.title })),
    silence: false,
    silenceLogged: false,
  };
}

export function orchestrate(
  graph: GraphState,
  log: AuditEvent[],
  opts?: { failAgent?: AgentId },
): { reports: AgentReport[]; actions: ProposedAction[]; verdict: Verdict } {
  const reports = runAgentFleet(graph, opts);
  for (const r of reports) {
    appendAudit(log, {
      at: new Date().toISOString(),
      type: "agent",
      actor: r.id,
      detail: `${r.title}: ${r.status}. ${r.summary}`,
      payload: { status: r.status },
    });
  }
  const hydroNull = reports.some((r) => r.id === "hydrology" && r.status === "null");
  const actions = hydroNull ? [] : buildActions(graph);
  const verdict = composeVerdict(graph.points, reports, actions);
  if (verdict.silence) {
    appendAudit(log, {
      at: new Date().toISOString(),
      type: "silence",
      actor: "orchestrator",
      detail: verdict.text,
    });
  } else {
    appendAudit(log, {
      at: new Date().toISOString(),
      type: "recommendation",
      actor: "orchestrator",
      detail: verdict.text,
      payload: { count: verdict.count, actions: verdict.actions },
    });
  }
  return { reports, actions, verdict };
}

export function emptyGraph(
  points: PointState[],
  rainfall: { mmPerHr: number; series: number[]; provenance: Provenance },
  extras?: Pick<GraphState, "roads" | "resources" | "shelters">,
): GraphState {
  return { points, rainfall, writes: [], ...extras };
}
