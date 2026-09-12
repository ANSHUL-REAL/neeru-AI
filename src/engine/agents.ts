import { RESOURCES, ROADS, SHELTERS, type ResourceUnit, type RoadSeg, type ShelterSite } from "../data/assets.ts";
import { DT_HOURS } from "../data/catchment.ts";
import type {
  AgentId,
  AgentReport,
  GraphWrite,
  PointState,
  Provenance,
} from "../types.ts";
import { onsetMinutes } from "./solver.ts";

export const AGENT_TITLES: Record<AgentId, string> = {
  nowcast: "Nowcast",
  hydrology: "Hydrology",
  exposure: "Exposure",
  route: "Route",
  alert: "Alert",
  dispatch: "Dispatch",
  shelter: "Shelter",
  recovery: "Recovery",
};

export const AGENT_ORDER: AgentId[] = [
  "nowcast",
  "hydrology",
  "exposure",
  "route",
  "alert",
  "dispatch",
  "shelter",
  "recovery",
];

export type GraphState = {
  points: PointState[];
  rainfall: { mmPerHr: number; series: number[]; provenance: Provenance };
  writes: GraphWrite[];
  roads?: RoadSeg[];
  resources?: ResourceUnit[];
  shelters?: ShelterSite[];
  nowcast?: Record<string, unknown>;
  hydrology?: Record<string, unknown>;
  exposure?: Record<string, unknown>;
  route?: Record<string, unknown>;
  alert?: Record<string, unknown>;
  dispatch?: Record<string, unknown>;
  shelter?: Record<string, unknown>;
  recovery?: Record<string, unknown>;
};

function write(graph: GraphState, agentId: AgentId, field: string, value: Record<string, unknown>) {
  graph.writes.push({
    at: new Date().toISOString(),
    agentId,
    field,
  });
  graph[agentId] = value;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function activated(points: PointState[]): PointState[] {
  return points.filter((p) => p.onsetStep !== null || p.manualRaise);
}

function ordered(points: PointState[]): PointState[] {
  return activated(points)
    .slice()
    .sort((a, b) => {
      const ao = a.onsetStep ?? 1e9;
      const bo = b.onsetStep ?? 1e9;
      if (ao !== bo) return ao - bo;
      return b.depthM - a.depthM;
    });
}

function nullReport(id: AgentId, reason: string): AgentReport {
  return {
    id,
    title: AGENT_TITLES[id],
    status: "null",
    summary: reason,
    finding: { type: "null", reason },
  };
}

function okReport(id: AgentId, summary: string, finding: Record<string, unknown>): AgentReport {
  return {
    id,
    title: AGENT_TITLES[id],
    status: "ok",
    summary,
    finding,
  };
}

export function runNowcast(graph: GraphState): AgentReport {
  const series = graph.rainfall.series;
  const peak = series.reduce((m, v) => Math.max(m, v), 0);
  const mean = series.reduce((a, b) => a + b, 0) / Math.max(1, series.length);
  const finding = {
    peakMmHr: round1(peak),
    meanMmHr: round1(mean),
    currentMmHr: round1(graph.rainfall.mmPerHr),
    provenance: graph.rainfall.provenance,
    catchments: ["kukatpally", "balkapur"],
  };
  write(graph, "nowcast", "intensity", finding);
  return okReport(
    "nowcast",
    `Peak ${round1(peak)} mm/hr ${graph.rainfall.provenance.kind}, mean ${round1(mean)} mm/hr`,
    finding,
  );
}

export function runHydrology(graph: GraphState): AgentReport {
  const set = ordered(graph.points);
  if (set.length === 0) {
    const finding = { type: "null", activations: [] as string[], reason: "no activation predicted" };
    write(graph, "hydrology", "activations", finding);
    return nullReport("hydrology", "No activation predicted");
  }
  const finding = {
    activations: set.map((p) => ({
      id: p.id,
      name: p.name,
      onsetMin: onsetMinutes(p),
      depthCm: Math.round(p.depthM * 100),
      peakCm: Math.round(p.peakM * 100),
      elevM: round1(p.elevM),
      manualRaise: p.manualRaise,
    })),
    order: set.map((p) => p.id),
  };
  write(graph, "hydrology", "activations", finding);
  const first = set[0];
  return okReport(
    "hydrology",
    `${set.length} point${set.length === 1 ? "" : "s"}. First ${first.name} at ${onsetMinutes(first)} min, ${Math.round(first.depthM * 100)} cm modelled`,
    finding,
  );
}

export function runExposure(graph: GraphState): AgentReport {
  const hydro = graph.hydrology;
  const ids = (hydro?.order as string[] | undefined) ?? ordered(graph.points).map((p) => p.id);
  if (!ids.length) {
    const finding = { type: "null", reason: "no activation predicted", households: 0 };
    write(graph, "exposure", "exposure", finding);
    return nullReport("exposure", "No activation predicted");
  }
  const pts = ids
    .map((id) => graph.points.find((p) => p.id === id))
    .filter((p): p is PointState => Boolean(p));
  const households = pts.reduce((s, p) => s + p.households, 0);
  const schools = pts.reduce((s, p) => s + p.schools, 0);
  const clinics = pts.reduce((s, p) => s + p.clinics, 0);
  const underpasses = pts.reduce((s, p) => s + p.underpasses, 0);
  const finding = {
    households,
    schools,
    clinics,
    underpasses,
    perPoint: pts.map((p) => ({
      id: p.id,
      households: p.households,
      schools: p.schools,
      clinics: p.clinics,
      underpasses: p.underpasses,
    })),
  };
  write(graph, "exposure", "exposure", finding);
  return okReport(
    "exposure",
    `${households} households, ${schools} schools, ${clinics} clinics, ${underpasses} underpasses modelled`,
    finding,
  );
}

export function runRoute(graph: GraphState): AgentReport {
  const set = ordered(graph.points);
  if (!set.length) {
    const finding = { type: "null", closures: [] as string[], reason: "no activation predicted" };
    write(graph, "route", "closures", finding);
    return nullReport("route", "No activation predicted");
  }
  const roads = graph.roads ?? ROADS;
  const closures = set
    .map((p) => {
      const road = roads.find((r) => r.pointId === p.id);
      if (!road && p.kind !== "underpass") return null;
      const onset = onsetMinutes(p) ?? 0;
      const issue = Math.max(0, onset - 25);
      return {
        pointId: p.id,
        name: road?.name ?? p.name,
        issueMin: issue,
        onsetMin: onset,
        alternate: road?.alternate ?? "Local diversion on signed GHMC route",
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  if (!closures.length) {
    const finding = { type: "null", closures: [], reason: "no road closure warranted" };
    write(graph, "route", "closures", finding);
    return nullReport("route", "No road closure warranted");
  }
  const finding = { closures };
  write(graph, "route", "closures", finding);
  return okReport("route", `${closures.length} closure${closures.length === 1 ? "" : "s"} proposed`, finding);
}

const LANG: Record<string, string> = {
  te: "Telugu",
  hi: "Hindi",
  ur: "Urdu",
  en: "English",
  id: "Indonesian",
  bn: "Bengali",
  es: "Spanish",
  pt: "Portuguese",
  th: "Thai",
  vi: "Vietnamese",
  ja: "Japanese",
};

export function runAlert(graph: GraphState): AgentReport {
  const set = ordered(graph.points);
  if (!set.length) {
    const finding = { type: "null", warnings: [] as string[], reason: "no activation predicted" };
    write(graph, "alert", "warnings", finding);
    return nullReport("alert", "No activation predicted");
  }
  const warnings = set.map((p) => {
    const minutes = onsetMinutes(p) ?? 0;
    const depthCm = Math.round(p.depthM * 100);
    const action =
      p.kind === "underpass"
        ? "Do not enter the underpass"
        : "Move vehicles off the low road";
    return {
      pointId: p.id,
      locality: p.name,
      depthCm,
      minutes,
      language: LANG[p.language] ?? p.language,
      instruction: `${p.name}: ${depthCm} cm modelled in ${minutes} min. ${action}.`,
      recipients: p.households,
    };
  });
  const finding = { warnings, recipientCount: warnings.reduce((s, w) => s + w.recipients, 0) };
  write(graph, "alert", "warnings", finding);
  return okReport(
    "alert",
    `${warnings.length} targeted warning${warnings.length === 1 ? "" : "s"}, ${finding.recipientCount} households modelled`,
    finding,
  );
}

export function runDispatch(graph: GraphState): AgentReport {
  const set = ordered(graph.points);
  if (!set.length) {
    const finding = { type: "null", assignments: [] as string[], reason: "no activation predicted" };
    write(graph, "dispatch", "assignments", finding);
    return nullReport("dispatch", "No activation predicted");
  }
  const used = new Set<string>();
  const assignments = set.map((p) => {
    const roster = graph.resources ?? RESOURCES;
    const candidates = roster.map((r) => ({ r, km: haversineKm(p, r) })).sort(
      (a, b) => a.km - b.km,
    );
    const pick = candidates.find((c) => !used.has(c.r.id)) ?? candidates[0];
    used.add(pick.r.id);
    const minutes = onsetMinutes(p) ?? 0;
    const lead = Math.max(15, minutes - 20);
    return {
      pointId: p.id,
      pointName: p.name,
      unitId: pick.r.id,
      unitName: pick.r.name,
      km: Math.round(pick.km * 10) / 10,
      leadMin: lead,
      instruction: `Stage ${pick.r.name} at ${p.name} in ${lead} min. Reason: ${Math.round(p.depthM * 100)} cm modelled.`,
    };
  });
  const finding = { assignments };
  write(graph, "dispatch", "assignments", finding);
  return okReport("dispatch", `${assignments.length} staging assignment${assignments.length === 1 ? "" : "s"}`, finding);
}

export function runShelter(graph: GraphState): AgentReport {
  const set = ordered(graph.points);
  if (!set.length) {
    const finding = { type: "null", openings: [] as string[], reason: "no activation predicted" };
    write(graph, "shelter", "openings", finding);
    return nullReport("shelter", "No activation predicted");
  }
  const households = set.reduce((s, p) => s + p.households, 0);
  const people = Math.round(households * 3.4);
  const halls = graph.shelters ?? SHELTERS;
  const openings = halls.map((s) => {
    const nearest = set
      .map((p) => ({ p, km: haversineKm(p, s) }))
      .sort((a, b) => a.km - b.km)[0];
    return {
      id: s.id,
      name: s.name,
      capacity: s.capacity,
      near: nearest.p.name,
      walkKm: Math.round(nearest.km * 10) / 10,
    };
  });
  const cap = openings.reduce((s, o) => s + o.capacity, 0);
  const finding = { people, capacity: cap, openings };
  write(graph, "shelter", "openings", finding);
  return okReport(
    "shelter",
    `${openings.length} shelters, ${cap} capacity against ${people} people modelled`,
    finding,
  );
}

export function runRecovery(graph: GraphState): AgentReport {
  const set = ordered(graph.points);
  const peakRain = graph.rainfall.series.reduce((m, v) => Math.max(m, v), 0);
  if (!set.length) {
    const finding = {
      type: "null",
      desilt: [] as string[],
      reason: "no segment failed below design capacity",
    };
    write(graph, "recovery", "desilt", finding);
    return nullReport("recovery", "No segment failed below design capacity");
  }
  const desilt = set.map((p) => ({
    pointId: p.id,
    name: p.name,
    catchment: p.catchment,
    peakCm: Math.round(p.peakM * 100),
    belowDesign: peakRain < 80,
    note: `${p.name} ponded ${Math.round(p.peakM * 100)} cm modelled while peak rain was ${round1(peakRain)} mm/hr`,
  }));
  const finding = { desilt, claims: set.length };
  write(graph, "recovery", "desilt", finding);
  return okReport("recovery", `${desilt.length} nala segments flagged for desilting review`, finding);
}

const RUNNERS: Record<AgentId, (g: GraphState) => AgentReport> = {
  nowcast: runNowcast,
  hydrology: runHydrology,
  exposure: runExposure,
  route: runRoute,
  alert: runAlert,
  dispatch: runDispatch,
  shelter: runShelter,
  recovery: runRecovery,
};

export function runAgentFleet(
  graph: GraphState,
  opts?: { failAgent?: AgentId },
): AgentReport[] {
  const reports: AgentReport[] = [];
  for (const id of AGENT_ORDER) {
    if (opts?.failAgent === id) {
      reports.push({
        id,
        title: AGENT_TITLES[id],
        status: "failed",
        summary: "Timed out",
        finding: null,
        error: "forced failure",
      });
      continue;
    }
    try {
      reports.push(RUNNERS[id](graph));
    } catch (err) {
      reports.push({
        id,
        title: AGENT_TITLES[id],
        status: "failed",
        summary: "Failed",
        finding: null,
        error: err instanceof Error ? err.message : "error",
      });
    }
  }
  return reports;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export { DT_HOURS };
