export type ResourceUnit = {
  id: string;
  name: string;
  kind: "pump" | "drf";
  lat: number;
  lng: number;
};

export type ShelterSite = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  capacity: number;
};

export type RoadSeg = {
  id: string;
  name: string;
  pointId: string;
  alternate: string;
};

export const RESOURCES: ResourceUnit[] = [
  { id: "drf-kukatpally", name: "DRF Kukatpally", kind: "drf", lat: 17.4935, lng: 78.402 },
  { id: "pump-hafeezpet", name: "Pump Hafeezpet", kind: "pump", lat: 17.482, lng: 78.366 },
  { id: "drf-ameerpet", name: "DRF Ameerpet", kind: "drf", lat: 17.436, lng: 78.445 },
  { id: "pump-mehdipatnam", name: "Pump Mehdipatnam", kind: "pump", lat: 17.3958, lng: 78.4372 },
];

export const SHELTERS: ShelterSite[] = [
  { id: "kphb-hall", name: "KPHB community hall", lat: 17.492, lng: 78.392, capacity: 420 },
  { id: "srnagar-indoor", name: "SR Nagar indoor stadium", lat: 17.443, lng: 78.441, capacity: 800 },
  { id: "tolichowki-school", name: "Tolichowki municipal school", lat: 17.402, lng: 78.418, capacity: 350 },
];

export const ROADS: RoadSeg[] = [
  {
    id: "rd-punjagutta",
    name: "Punjagutta underpass",
    pointId: "punjagutta",
    alternate: "Road No. 1 via Khairatabad",
  },
  {
    id: "rd-hafeezpet",
    name: "Hafeezpet railway underpass",
    pointId: "hafeezpet",
    alternate: "Hafeezpet ROB / Kondapur",
  },
  {
    id: "rd-kukatpally",
    name: "Kukatpally main road at Y Junction",
    pointId: "kukatpally-y",
    alternate: "Moosapet metro service road",
  },
  {
    id: "rd-ameerpet",
    name: "Ameerpet main road",
    pointId: "ameerpet",
    alternate: "SR Nagar / Punjabgutta link",
  },
];
