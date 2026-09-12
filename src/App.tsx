import { useEffect, useMemo, useState } from "react";
import { FORECAST_STEPS } from "./data/catchment.ts";
import type { Catchment } from "./data/catchment.ts";
import { requestTripWarning } from "./engine/brief.ts";
import { appendLog, loadLog, type LogRow } from "./engine/log.ts";
import { HelpChat } from "./ui/HelpChat.tsx";
import { ConsoleBoard } from "./ui/ConsoleBoard.tsx";
import { AGENT_ORDER, AGENT_TITLES } from "./engine/agents.ts";
import { commitAction, refuseAction } from "./engine/authority.ts";
import type { AgentReport, ProposedAction } from "./types.ts";
import {
  QUICK_CITIES,
  fetchLiveRainAt,
  loadCityCatchment,
  reversePlace,
  searchCities,
  type City,
} from "./engine/city.ts";
import { runForecast } from "./engine/forecast.ts";
import { planTrip, type LatLng, type TripPlan } from "./engine/route.ts";
import type { ForecastResult, RainSourceId } from "./types.ts";
import { Hero } from "./ui/Hero.tsx";
import type { LiveRain } from "./types.ts";

function cityAssets(city: City, points: Catchment["points"]) {
  return {
    roads: points.map((p) => ({
      id: `rd-${p.id}`,
      name: p.name,
      pointId: p.id,
      alternate: `Local diversion away from ${p.name}`,
    })),
    resources: [
      { id: "crew-a", name: `${city.name} crew A`, kind: "drf" as const, lat: city.lat, lng: city.lng },
      { id: "crew-b", name: `${city.name} crew B`, kind: "pump" as const, lat: city.lat + 0.012, lng: city.lng - 0.01 },
    ],
    shelters: [
      { id: "hall", name: `${city.name} civic hall`, lat: city.lat, lng: city.lng, capacity: 700 },
    ],
  };
}

const FLEET_FALLBACK: AgentReport[] = AGENT_ORDER.map((id) => ({
  id,
  title: AGENT_TITLES[id],
  status: "null",
  summary: "waiting on dependencies",
  finding: { type: "null", reason: "no city open" },
}));

function localWarning(trip: TripPlan): string {
  const start = trip.from.name ?? "here";
  const end = trip.to.name ?? "your destination";
  const first = `Go from ${start} to ${end}. ${trip.km} km, about ${trip.minutes} min.`;
  if (!trip.hits.length) {
    return `${first} No modelled flood sits on this drive. This is not an all-clear.`;
  }
  const avoid = trip.hits.map((h) => h.name).join(", ");
  const via = trip.via?.name ? ` Go via ${trip.via.name}.` : "";
  return `${first} Do not enter ${avoid}.${via}`;
}

export default function App() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<City[]>([]);
  const [toQuery, setToQuery] = useState("");
  const [toHits, setToHits] = useState<City[]>([]);
  const [city, setCity] = useState<City | null>(null);
  const [catchment, setCatchment] = useState<Catchment | null>(null);
  const [loading, setLoading] = useState(false);
  const [routing, setRouting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<RainSourceId>("live");
  const [peak, setPeak] = useState(95);
  const [failAgent, setFailAgent] = useState(false);
  const [liveWx, setLiveWx] = useState<LiveRain | null>(null);
  const [t0, setT0] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  const [result, setResult] = useState<ForecastResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [dest, setDest] = useState<LatLng | null>(null);
  const [trip, setTrip] = useState<TripPlan | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [page, setPage] = useState<"home" | "console" | "how" | "fleet" | "data" | "help" | "pick">("home");
  const [menuOpen, setMenuOpen] = useState(false);
  const [callLog, setCallLog] = useState<LogRow[]>([]);

  useEffect(() => {
    setCallLog(loadLog());
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.clearInterval(tick);
    };
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void searchCities(q).then(setHits).catch(() => setHits([]));
    }, 220);
    return () => window.clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const q = toQuery.trim();
    if (q.length < 2) {
      setToHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void searchCities(q).then(setToHits).catch(() => setToHits([]));
    }, 220);
    return () => window.clearTimeout(t);
  }, [toQuery]);

  async function openCity(next: City, asOrigin = true) {
    setError(null);
    setLoading(true);
    setCity(next);
    setQuery(next.name);
    setHits([]);
    setTrip(null);
    setDest(null);
    setWarning(null);
    try {
      const [cap, live, placeName] = await Promise.all([
        loadCityCatchment(next),
        fetchLiveRainAt(next.lat, next.lng).catch(() => null),
        reversePlace(next.lat, next.lng).catch(() => next.name),
      ]);
      setCatchment(cap);
      setSelectedId(cap.points[0]?.id ?? null);
      if (asOrigin) setOrigin({ lat: next.lat, lng: next.lng, name: placeName });
      setLiveWx(live);
      const extras = cityAssets(next, cap.points);
      const forecast = runForecast({
        source,
        live,
        catchment: cap,
        extras,
        steps: FORECAST_STEPS,
        failAgent: failAgent ? "alert" : undefined,
        peakMmHr: peak,
      });
      setResult(forecast);
      appendLog("city", next.name, `Opened catchment at ${next.lat.toFixed(3)}, ${next.lng.toFixed(3)}`);
      setCallLog(loadLog());
      setPage("console");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this place");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!city || !catchment) return;
    let cancelled = false;
    void (async () => {
      try {
        const live = source === "live" ? await fetchLiveRainAt(city.lat, city.lng) : liveWx;
        if (source === "live") setLiveWx(live);
        if (cancelled) return;
        const extras = cityAssets(city, catchment.points);
        setResult(
          runForecast({
            source,
            live,
            catchment,
            extras,
            steps: FORECAST_STEPS,
            failAgent: failAgent ? "alert" : undefined,
            peakMmHr: peak,
          }),
        );
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Rain feed failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [source, city, catchment, failAgent, peak]);

  function here() {
    if (!navigator.geolocation) {
      setError("This browser has no geolocation. Search a city instead.");
      return;
    }
    setError(null);
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void (async () => {
          const name = await reversePlace(pos.coords.latitude, pos.coords.longitude).catch(
            () => "Your location",
          );
          await openCity(
            {
              id: `here-${pos.coords.latitude.toFixed(3)}-${pos.coords.longitude.toFixed(3)}`,
              name,
              country: "",
              countryCode: "",
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            },
            true,
          );
        })();
      },
      (err) => {
        setLoading(false);
        if (err.code === err.PERMISSION_DENIED) {
          setError("Location permission denied. Allow it in the browser, or search a city.");
        } else if (err.code === err.TIMEOUT) {
          setError("Location timed out. Try again, or search a city.");
        } else {
          setError("Could not read location. Search a city instead.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  const floodedPts = useMemo(
    () => (result ? result.points.filter((p) => p.onsetStep !== null || p.manualRaise) : []),
    [result],
  );
  const clearPts = useMemo(
    () => (result ? result.points.filter((p) => p.onsetStep === null && !p.manualRaise) : []),
    [result],
  );

  async function goTo(place: City) {
    if (!origin) {
      setError("Need your location first.");
      return;
    }
    setToQuery(place.name);
    setToHits([]);
    setDest({ lat: place.lat, lng: place.lng, name: place.name });
    setRouting(true);
    setError(null);
    try {
      const planned = await planTrip(
        origin,
        { lat: place.lat, lng: place.lng, name: place.name },
        floodedPts,
        clearPts,
      );
      setTrip(planned);
      const fallback = localWarning(planned);
      setWarning(fallback);
      const spoken = await requestTripWarning({
        from: planned.from.name ?? "here",
        to: planned.to.name ?? place.name,
        km: planned.km,
        minutes: planned.minutes,
        flooded: planned.hits.map((h) => h.name),
        via: planned.via?.name ?? null,
      });
      if (spoken) setWarning(spoken);
      appendLog(
        "trip",
        `${planned.from.name ?? "here"} to ${planned.to.name ?? place.name}`,
        spoken ?? fallback,
      );
      setCallLog(loadLog());
      setPage("console");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not route");
    } finally {
      setRouting(false);
    }
  }

  const flooded = Boolean(result && !result.verdict.silence);

  function openPage(next: "home" | "console" | "how" | "fleet" | "data" | "help" | "pick") {
    setMenuOpen(false);
    setCallLog(loadLog());
    if (next === "console" && !city) {
      setPage("pick");
      return;
    }
    setPage(next);
  }

  function runStorm() {
    setSource("storm");
    setT0(Date.now());
    appendLog("storm", "Run a storm", `Heavy-rain fixture ${peak} mm/hr modelled`);
    setCallLog(loadLog());
    if (!city || !catchment) {
      setPage("pick");
      return;
    }
    const extras = cityAssets(city, catchment.points);
    setResult(
      runForecast({
        source: "storm",
        live: liveWx,
        catchment,
        extras,
        steps: FORECAST_STEPS,
        failAgent: failAgent ? "alert" : undefined,
        peakMmHr: peak,
      }),
    );
    setPage("console");
  }

  function tLabel() {
    const s = Math.max(0, Math.floor((now - t0) / 1000));
    const m = Math.floor(s / 60);
    return `T+${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  function act(action: ProposedAction, mode: "ok" | "no") {
    if (!result) return;
    const fn = mode === "ok" ? commitAction : refuseAction;
    const out = fn(action, { role: "operator", actor: "control-1", log: result.audit });
    setResult({
      ...result,
      actions: result.actions.map((a) => (a.id === out.action.id ? out.action : a)),
      audit: result.audit.slice(),
    });
    appendLog("trip", out.action.title, out.reason);
    setCallLog(loadLog());
  }

  return (
    <div className="shell">
      <nav className={page === "home" ? "navbar home" : "navbar scrolled"}>
        <button type="button" className="logo" onClick={() => openPage("home")}>
          <span className="logo-icon" />
          Neeru <span>AI</span>
        </button>
        <button
          type="button"
          className="menu-toggle"
          aria-label="Menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          Menu
        </button>
        <div className={menuOpen ? "nav-links open" : "nav-links"}>
          <button type="button" className={page === "home" ? "active" : ""} onClick={() => openPage("home")}>
            Home
          </button>
          <button type="button" className={page === "console" ? "active" : ""} onClick={() => openPage("console")}>
            Console
          </button>
          <button type="button" className={page === "how" ? "active" : ""} onClick={() => openPage("how")}>
            How it works
          </button>
          <button type="button" className={page === "fleet" ? "active" : ""} onClick={() => openPage("fleet")}>
            The Fleet
          </button>
          <button type="button" className={page === "data" ? "active" : ""} onClick={() => openPage("data")}>
            Data
          </button>
          <button type="button" className={page === "help" ? "active" : ""} onClick={() => openPage("help")}>
            Help
          </button>
          <button type="button" className="btn-cta" onClick={runStorm}>
            Run a storm
          </button>
        </div>
      </nav>

      {page === "home" ? (
      <div className="hero-pinned-wrapper" id="top">
        <Hero flooded={flooded}>
          <p className="welcome-text">Predictive flood response · any city</p>
          <h1 className="landing-title">Neeru</h1>
          <p className="hero-desc">
            It is raining there, so where does the water end up? Neeru routes rain over real
            terrain, then eight agents turn that into closures, warnings and a route. A human still
            commits. Nothing is sent outbound.
          </p>
          <div className="hero-cta">
            <button type="button" className="btn btn-primary" onClick={() => openPage("console")}>
              Open the console
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => openPage("how")}>
              See how it works
            </button>
          </div>
          <div className="hero-stats">
            <div>
              <strong>31.8 cm</strong>
              <span>rain in 24h · Oct 2020 Hyderabad · reported</span>
            </div>
            <div>
              <strong>50+</strong>
              <span>deaths in that event · reported</span>
            </div>
            <div>
              <strong>~200</strong>
              <span>points flooding each year · reported</span>
            </div>
          </div>
          <p className="ninety">Ninety minutes before the water</p>
          {error ? <p className="err">{error}</p> : null}
        </Hero>
      </div>
      ) : page === "pick" ? (
        <main className="desk">
          <h1>Which city?</h1>
          <p className="lede">
            We need a place so Open-Meteo can fetch rain and elevation, OpenStreetMap can draw the
            streets, and the solver can run on that box. Pick one, then the console opens.
          </p>
          <button type="button" className="btn btn-primary" onClick={here} disabled={loading}>
            {loading ? "Finding you" : "Use my location"}
          </button>
          <p className="why">
            Uses the browser geolocation API (HTTPS). Then Open-Meteo reverse geocoding names the
            place, and the same rain and terrain APIs run as for a typed city.
          </p>
          <form
            className="city-search"
            onSubmit={(e) => {
              e.preventDefault();
              if (hits[0]) void openCity(hits[0]);
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Jakarta, Houston, Hyderabad..."
              aria-label="City"
              autoComplete="off"
            />
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Loading terrain" : "Use this city"}
            </button>
          </form>
          {hits.length > 0 ? (
            <ul className="hits dark">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => void openCity(h)}>
                    {h.name}
                    <span>
                      {h.admin1 ? `${h.admin1}, ` : ""}
                      {h.country}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="chips">
            {QUICK_CITIES.map((c) => (
              <button key={c.id} type="button" className="chip dark" onClick={() => void openCity(c)}>
                {c.name}
              </button>
            ))}
          </div>
          <p className="why">City search uses the Open-Meteo geocoding API.</p>
          {error ? <p className="err">{error}</p> : null}
        </main>
      ) : page === "how" ? (
        <main className="desk story">
          <h1>Cell, solver, graph, action</h1>
          <p className="lede">Five stages between rain on a real city and a person already moving.</p>
          <ol className="pipeline">
            <li><strong>Storm</strong><span>where it rains, and how hard</span></li>
            <li><strong>Solver</strong><span>water routed over terrain</span></li>
            <li><strong>Activation</strong><span>which points pond past 30 cm, and when</span></li>
            <li><strong>Agent graph</strong><span>eight agents, each reading the last</span></li>
            <li><strong>You</strong><span>one warning, one route, one chat answer</span></li>
          </ol>
          <div className="story-grid">
            <article><b>1</b><h3>Find the rain</h3><p>Live Open-Meteo at your city, or Run a storm for a 68 mm/hr modelled fixture so the wet roads show.</p></article>
            <article><b>2</b><h3>Route the water</h3><p>A 48 by 48 height field over the real map. Water moves to lower neighbours. Drains take what they can. Where inflow beats capacity, it ponds.</p></article>
            <article><b>3</b><h3>Detect activation</h3><p>A watched point activates at 30 cm modelled, the depth a two-wheeler cannot pass. Onset is recorded once and never cleared.</p></article>
            <article><b>4</b><h3>Run the graph</h3><p>Eight agents read that shared state. If one fails, the others still report. Null findings are shown, not hidden.</p></article>
            <article><b>5</b><h3>Tell a person</h3><p>Go from here to there. Do not enter the flooded underpass. Every trip and every Help question is written to the call log on this device, and to Supabase when that table exists.</p></article>
          </div>
        </main>
      ) : page === "fleet" ? (
        <main className="desk story">
          <h1>Eight agents, wired into each other</h1>
          <p className="lede">Not eight tools reading one table. Each row below is live when a city is open.</p>
          <div className="fleet-grid">
            {(result?.reports ?? FLEET_FALLBACK).map((r) => (
              <article key={r.id}>
                <p className="kicker">{r.status}</p>
                <h3>{r.title}</h3>
                <p>{r.summary}</p>
              </article>
            ))}
          </div>
        </main>
      ) : (
      <main id="desk" className="desk">
        {!result || !catchment || !city ? (
          <p className="empty">Allow location or pick a city from Home.</p>
        ) : (
          <>
            {page === "console" ? (
              <>
                <section className="go-box">
                  <h2>I want to go</h2>
                  <form
                    className="city-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (toHits[0]) void goTo(toHits[0]);
                    }}
                  >
                    <input
                      value={toQuery}
                      onChange={(e) => setToQuery(e.target.value)}
                      placeholder="A neighbourhood, station, hospital..."
                      aria-label="Destination"
                      autoComplete="off"
                    />
                    <button type="submit" className="btn btn-primary" disabled={routing || !origin}>
                      {routing ? "Routing" : "Go"}
                    </button>
                  </form>
                  {toHits.length > 0 ? (
                    <ul className="hits dark">
                      {toHits.map((h) => (
                        <li key={h.id}>
                          <button type="button" onClick={() => void goTo(h)}>
                            {h.name}
                            <span>{h.country}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </section>
                {warning ? (
                  <section className="warn-card" data-hit={trip && trip.hits.length > 0 ? "1" : "0"}>
                    <h2>Warning</h2>
                    <p>{warning}</p>
                  </section>
                ) : null}
                <ConsoleBoard
                  city={city}
                  catchment={catchment}
                  result={result}
                  live={liveWx}
                  origin={origin}
                  dest={dest}
                  trip={trip}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  peak={peak}
                  onPeak={setPeak}
                  onRunStorm={runStorm}
                  failAgent={failAgent}
                  onFailAgent={setFailAgent}
                  onApprove={(a) => act(a, "ok")}
                  onRefuse={(a) => act(a, "no")}
                  tLabel={tLabel()}
                  onChangeCity={() => setPage("pick")}
                  onUseLocation={here}
                />
              </>
            ) : null}

            {page === "help" ? (
              <HelpChat
                cityName={city.name}
                you={origin?.name ?? city.name}
                result={result}
                lastTrip={trip ? `${trip.from.name} to ${trip.to.name}` : null}
              />
            ) : null}

            {page === "data" ? (
              <section className="go-box">
                <h2>Call log</h2>
                <p className="muted">
                  Stored on this device first. If Supabase table call_log exists, each row is also
                  posted there. Trips, Help questions, and Run a storm are kinds of rows. Nothing is
                  deleted.
                </p>
                {callLog.length === 0 ? (
                  <p>No rows yet. Run a storm or ask Help.</p>
                ) : (
                  <ol className="points">
                    {callLog.map((row) => (
                      <li key={row.id}>
                        <div className="point">
                          <span className="mark" />
                          <span>
                            <strong>
                              {row.kind} · {row.title}
                            </strong>
                            <em>{row.detail}</em>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ) : null}
          </>
        )}
      </main>
      )}

      {page === "console" && warning ? (
        <div className="dock">
          <p>{warning}</p>
        </div>
      ) : null}
    </div>
  );
}
