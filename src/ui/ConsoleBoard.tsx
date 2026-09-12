import type { Catchment } from "../data/catchment.ts";
import { COLS, ROWS } from "../data/catchment.ts";
import { haversineM } from "../engine/route.ts";
import type {
  AgentId,
  ForecastResult,
  LiveRain,
  PointState,
  ProposedAction,
} from "../types.ts";
import { HelpChat } from "./HelpChat.tsx";
import { MapPanel } from "./MapPanel.tsx";
import type { City } from "../engine/city.ts";
import type { LatLng, TripPlan } from "../engine/route.ts";

function localMm(peak: number, center: LatLng, p: LatLng): number {
  const d = haversineM(center, p) / 1000;
  return Math.round(peak * Math.exp(-(d * d) / (2 * 4.8 * 4.8)) * 10) / 10;
}

function statusOf(p: PointState, local: number): string {
  if (p.onsetStep !== null) return "activated";
  if (local >= 2) return "draining";
  return "no rain";
}

type Props = {
  city: City;
  catchment: Catchment;
  result: ForecastResult;
  live: LiveRain | null;
  origin: LatLng | null;
  dest: LatLng | null;
  trip: TripPlan | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  peak: number;
  onPeak: (n: number) => void;
  onRunStorm: () => void;
  failAgent: boolean;
  onFailAgent: (v: boolean) => void;
  onApprove: (a: ProposedAction) => void;
  onRefuse: (a: ProposedAction) => void;
  tLabel: string;
  onChangeCity: () => void;
};

export function ConsoleBoard({
  city,
  catchment,
  result,
  live,
  origin,
  dest,
  trip,
  selectedId,
  onSelect,
  peak,
  onPeak,
  onRunStorm,
  failAgent,
  onFailAgent,
  onApprove,
  onRefuse,
  tLabel,
  onChangeCity,
}: Props) {
  const center = origin ?? { lat: city.lat, lng: city.lng, name: city.name };
  const peakNow = result.rainfall.mmPerHr;
  const reported = result.reports.filter((r) => r.status !== "failed").length;
  const bbox = catchment.bbox;

  const rows = result.points.map((p) => {
    const local = localMm(peakNow, center, p);
    return { p, local, status: statusOf(p, local) };
  });

  const alert = result.reports.find((r) => r.id === "alert");

  return (
    <div className="console-board">
      <header className="console-head">
        <div>
          <p className="kicker">{city.name} · standing by</p>
          <p className="clock">{tLabel}</p>
        </div>
        <div className="storm-controls">
          <label>
            Peak
            <input
              type="number"
              min={20}
              max={140}
              value={peak}
              onChange={(e) => onPeak(Number(e.target.value) || 95)}
            />
            <span>mm/hr</span>
          </label>
          <button type="button" className="btn btn-secondary" onClick={onChangeCity}>
            Change city
          </button>
          <button type="button" className="btn btn-primary" onClick={onRunStorm}>
            Run storm
          </button>
          <label className="fail">
            <input type="checkbox" checked={failAgent} onChange={(e) => onFailAgent(e.target.checked)} />
            Fail an agent
          </label>
        </div>
      </header>

      <section className="wx" aria-label="Observed now">
        <div>
          <span>Observed now</span>
          <strong>
            {(live?.mmPerHr ?? 0).toFixed(1)} mm/hr rain
          </strong>
          <em>Open-Meteo current precipitation at this city</em>
        </div>
        <div>
          <span>Conditions</span>
          <strong>{live?.weather ?? "—"}</strong>
          <em>Open-Meteo weather code, translated</em>
        </div>
        <div>
          <span>Temperature</span>
          <strong>{live?.temperatureC != null ? `${live.temperatureC.toFixed(1)} °C` : "—"}</strong>
          <em>Open-Meteo 2 m air temperature</em>
        </div>
        <div>
          <span>Humidity</span>
          <strong>{live?.humidity != null ? `${live.humidity} %` : "—"}</strong>
          <em>Open-Meteo relative humidity</em>
        </div>
        <div>
          <span>Rain next 24h</span>
          <strong>{live?.rain24hMm != null ? `${live.rain24hMm} mm` : "—"}</strong>
          <em>Sum of Open-Meteo hourly rain for 24 hours</em>
        </div>
        <div>
          <span>Peak in 48h</span>
          <strong>{live?.peak48hMmHr != null ? `${live.peak48hMmHr} mm/hr` : "—"}</strong>
          <em>Highest Open-Meteo hourly rain in 48 hours</em>
        </div>
      </section>

      <p className="meta-line">
        {city.name} · {bbox.south.toFixed(2)}–{bbox.north.toFixed(2)} N · {bbox.west.toFixed(2)}–
        {bbox.east.toFixed(2)} E · {COLS} × {ROWS} cells · 4 min per step · {result.rainfall.provenance.kind}
      </p>

      <div className="console-grid">
        <section className="map-wrap">
          <MapPanel
            catchment={catchment}
            points={result.points}
            depths={result.depths}
            selectedId={selectedId}
            onSelect={onSelect}
            origin={origin}
            dest={dest}
            route={trip?.coords}
          />
          <p className="map-legend">
            <span className="leg clear">Shallow</span>
            <span className="leg you">Ankle</span>
            <span className="leg flood">Above knee</span>
          </p>
        </section>

        <aside className="point-rail">
          {rows.map(({ p, local, status }) => (
            <button
              key={p.id}
              type="button"
              className="point"
              data-active={p.onsetStep !== null}
              data-selected={p.id === selectedId}
              onClick={() => onSelect(p.id)}
            >
              <span className="mark" data-active={p.onsetStep !== null} />
              <span>
                <strong>{p.name}</strong>
                <em>
                  {local} mm/hr local · {p.lat.toFixed(3)}N
                </em>
              </span>
              <span className="nums">
                <b>{Math.round(p.depthM * 100)} cm</b>
                <em>{status}</em>
              </span>
            </button>
          ))}
        </aside>
      </div>

      <section className="agent-graph">
        <h2>Agent graph · {reported}/8 reported</h2>
        <ul>
          {result.reports.map((r) => (
            <li key={r.id} data-status={r.status}>
              <span>{r.title}</span>
              <em>{r.status === "ok" ? r.summary : r.status === "null" ? "waiting / null" : "failed"}</em>
            </li>
          ))}
        </ul>
      </section>

      <div className="console-lower">
        <section className="queue">
          <h2>Approval queue</h2>
          <p className="muted">Human commits. Agents do not send.</p>
          {result.actions.length === 0 ? (
            <p>No actions pending. Run a storm to populate the queue.</p>
          ) : (
            <ul>
              {result.actions.map((a) => (
                <li key={a.id}>
                  <div>
                    <strong>{a.title}</strong>
                    <p>{a.instruction}</p>
                  </div>
                  <div className="act-btns">
                    <span className="status">{a.status}</span>
                    <button type="button" className="btn btn-primary" disabled={a.status !== "proposed"} onClick={() => onApprove(a)}>
                      Approve
                    </button>
                    <button type="button" className="btn btn-secondary" disabled={a.status !== "proposed"} onClick={() => onRefuse(a)}>
                      Hold
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <HelpChat
          cityName={city.name}
          you={origin?.name ?? city.name}
          result={result}
          lastTrip={trip ? `${trip.from.name} to ${trip.to.name}` : null}
        />
      </div>

      <section className="alert-out">
        <h2>Alert agent output</h2>
        <p>{alert?.summary ?? "No warnings composed."}</p>
      </section>

      <section className="dec-log">
        <h2>Decision log · append-only</h2>
        <ol>
          {result.audit
            .slice()
            .reverse()
            .slice(0, 14)
            .map((e) => (
              <li key={e.seq}>
                <span>{e.actor}</span> {e.detail}
              </li>
            ))}
        </ol>
      </section>

      <p className="footer-line">
        A prediction is not a warning until it reaches the person standing in the water. Figures are
        modelled or observed. Verify against primary sources before publication.
      </p>
    </div>
  );
}

export type { AgentId };
