import { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Polyline,
  Popup,
  Rectangle,
  TileLayer,
  useMap,
} from "react-leaflet";
import { COLS, cellToLatLngIn, type Catchment } from "../data/catchment.ts";
import type { PointState } from "../types.ts";
import type { LatLng } from "../engine/route.ts";

type Props = {
  catchment: Catchment;
  points: PointState[];
  depths: Float64Array;
  selectedId: string | null;
  onSelect: (id: string) => void;
  origin?: LatLng | null;
  dest?: LatLng | null;
  route?: [number, number][];
};

function Fit({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  const key = pts.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (pts.length >= 2) {
      map.fitBounds(pts, { padding: [36, 36] });
    }
    // key captures the path; pts is read from the render that produced it
  }, [map, key]);
  return null;
}

function wetCells(depths: Float64Array): { i: number; cm: number }[] {
  const out: { i: number; cm: number }[] = [];
  for (let i = 0; i < depths.length; i++) {
    const cm = depths[i] * 100;
    if (cm >= 8) out.push({ i, cm });
  }
  return out;
}

export function MapPanel({
  catchment,
  points,
  depths,
  selectedId,
  onSelect,
  origin,
  dest,
  route,
}: Props) {
  const { bbox } = catchment;
  const wet = wetCells(depths);
  const center: [number, number] = [
    (bbox.north + bbox.south) / 2,
    (bbox.east + bbox.west) / 2,
  ];
  const fit: [number, number][] = [];
  if (origin) fit.push([origin.lat, origin.lng]);
  if (dest) fit.push([dest.lat, dest.lng]);
  if (route && route.length) fit.push(...route.filter((_, i) => i % 8 === 0));

  return (
    <MapContainer
      key={catchment.cityName}
      center={center}
      zoom={13}
      className="map"
      scrollWheelZoom
      keyboard
      aria-label={`${catchment.cityName} flood map`}
    >
      <TileLayer
        attribution="&copy; OpenStreetMap"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {fit.length >= 2 ? <Fit pts={fit} /> : null}
      {wet.map((w) => {
        const r = Math.floor(w.i / COLS);
        const c = w.i % COLS;
        const nw = cellToLatLngIn(bbox, r - 0.5, c - 0.5);
        const se = cellToLatLngIn(bbox, r + 0.5, c + 0.5);
        const t = Math.min(1, w.cm / 80);
        return (
          <Rectangle
            key={w.i}
            bounds={[
              [se.lat, nw.lng],
              [nw.lat, se.lng],
            ]}
            pathOptions={{
              stroke: false,
              fillColor: "#437485",
              fillOpacity: 0.18 + t * 0.35,
            }}
          />
        );
      })}
      {route && route.length > 1 ? (
        <Polyline positions={route} pathOptions={{ color: "#111726", weight: 5, opacity: 0.9 }} />
      ) : null}
      {points.map((p) => {
        const cm = Math.round(p.depthM * 100);
        const flooded = p.onsetStep !== null || p.manualRaise;
        const selected = p.id === selectedId;
        return (
          <CircleMarker
            key={p.id}
            center={[p.lat, p.lng]}
            radius={flooded ? 12 : 8}
            pathOptions={{
              color: selected ? "#f9de71" : flooded ? "#7a2e24" : "#1f6b4a",
              weight: 2,
              fill: true,
              fillColor: flooded ? "#c45c4a" : "#ffffff",
              fillOpacity: flooded ? 0.95 : 0.9,
            }}
            eventHandlers={{ click: () => onSelect(p.id) }}
          >
            <Popup>
              <strong>{p.name}</strong>
              <div>{flooded ? `Flooded · ${cm} cm modelled` : `Clear · ${cm} cm modelled`}</div>
            </Popup>
          </CircleMarker>
        );
      })}
      {origin ? (
        <CircleMarker
          center={[origin.lat, origin.lng]}
          radius={9}
          pathOptions={{ color: "#111726", fillColor: "#f9de71", fillOpacity: 1, weight: 2 }}
        >
          <Popup>You · {origin.name ?? "here"}</Popup>
        </CircleMarker>
      ) : null}
      {dest ? (
        <CircleMarker
          center={[dest.lat, dest.lng]}
          radius={9}
          pathOptions={{ color: "#111726", fillColor: "#e0e9ff", fillOpacity: 1, weight: 2 }}
        >
          <Popup>Go to {dest.name}</Popup>
        </CircleMarker>
      ) : null}
    </MapContainer>
  );
}
