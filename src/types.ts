export type ProvenanceKind = "observed" | "modelled" | "reported";

export type Provenance = {
  kind: ProvenanceKind;
  source: string;
  at: string;
};

export type AgentId =
  | "nowcast"
  | "hydrology"
  | "exposure"
  | "route"
  | "alert"
  | "dispatch"
  | "shelter"
  | "recovery";

export type AgentStatus = "ok" | "null" | "failed";

export type PointKind = "underpass" | "junction" | "colony";

export type Language = string;

export type CatchmentId = string;

export type Role = "operator" | "observer";

export type RainSourceId = "live" | "yesterday" | "oct2020" | "mm20" | "mm68" | "storm";

export type ActionKind = "closure" | "warning" | "dispatch" | "shelter" | "recovery";

export type ActionStatus = "proposed" | "approved" | "refused" | "queued";

export type BBox = {
  south: number;
  north: number;
  west: number;
  east: number;
};

export type FloodPointDef = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: PointKind;
  language: Language;
  catchment: CatchmentId;
  households: number;
  schools: number;
  clinics: number;
  underpasses: number;
  ward: string;
};

export type PointState = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: PointKind;
  language: Language;
  catchment: CatchmentId;
  cell: number;
  elevM: number;
  depthM: number;
  peakM: number;
  onsetStep: number | null;
  manualRaise: boolean;
  households: number;
  schools: number;
  clinics: number;
  underpasses: number;
  ward: string;
};

export type AgentReport = {
  id: AgentId;
  title: string;
  status: AgentStatus;
  summary: string;
  finding: Record<string, unknown> | null;
  error?: string;
};

export type ProposedAction = {
  id: string;
  kind: ActionKind;
  title: string;
  instruction: string;
  pointId: string | null;
  priority: number;
  leadMinutes: number;
  status: ActionStatus;
  evidence: string;
};

export type Verdict = {
  text: string;
  onset: { pointId: string; name: string; minutes: number } | null;
  count: number;
  deepest: { pointId: string; name: string; depthCm: number } | null;
  exposure: {
    households: number;
    schools: number;
    clinics: number;
    underpasses: number;
  };
  actions: { id: string; kind: ActionKind; title: string }[];
  silence: boolean;
  silenceLogged: boolean;
};

export type AuditEvent = {
  seq: number;
  at: string;
  type:
    | "prediction"
    | "recommendation"
    | "approval"
    | "refusal"
    | "outcome"
    | "silence"
    | "raise"
    | "agent";
  actor: string;
  detail: string;
  payload?: unknown;
};

export type GraphWrite = {
  at: string;
  agentId: AgentId;
  field: string;
};

export type LiveRain = {
  mmPerHr: number;
  hourlyMm: number[];
  hourlyTimes: string[];
  observedAt: string;
  source: string;
  degraded: boolean;
  intervalSec: number;
  temperatureC?: number;
  humidity?: number;
  weather?: string;
  rain24hMm?: number;
  peak48hMmHr?: number;
};

export type ForecastResult = {
  points: PointState[];
  depths: Float64Array;
  reports: AgentReport[];
  verdict: Verdict;
  actions: ProposedAction[];
  audit: AuditEvent[];
  rainfall: {
    mmPerHr: number;
    series: number[];
    provenance: Provenance;
  };
  steps: number;
  dtHours: number;
  volumeStartM3: number;
  volumeEndM3: number;
  volumeRainM3: number;
  volumeDrainM3: number;
};
