/**
 * 13 Oct 2020 hourly precipitation at 17.45N 78.41E from Open-Meteo archive
 * (ERA5-land reanalysis). Daily sum is lower than IMD station totals; the
 * backtest scales the shape to the 318 mm / 24 h figure cited for parts of
 * the city that day. Both series are labelled.
 */
export const OCT2020_OPEN_METEO_HOURLY_MM = [
  1.7, 1.8, 0.8, 0.8, 0.7, 0.5, 2.6, 2.7, 1.9, 1.0, 1.1, 2.5, 2.1, 2.5, 2.2,
  2.9, 2.8, 4.8, 3.3, 7.9, 13.1, 18.7, 2.0, 4.1,
];

export const OCT2020_REPORTED_24H_MM = 318;

export const OCT2020_OPEN_METEO_SUM_MM = OCT2020_OPEN_METEO_HOURLY_MM.reduce(
  (a, b) => a + b,
  0,
);

export const OCT2020_SCALE = OCT2020_REPORTED_24H_MM / OCT2020_OPEN_METEO_SUM_MM;

export const OCT2020_SCALED_HOURLY_MM = OCT2020_OPEN_METEO_HOURLY_MM.map(
  (v) => v * OCT2020_SCALE,
);

export const OCT2020_REPORTED_FLOOD: Record<string, boolean> = {
  "kukatpally-y": true,
  punjagutta: true,
  hafeezpet: true,
  ameerpet: true,
  tolichowki: true,
  yousufguda: true,
  balanagar: true,
  madhapur: true,
};

export const OCT2020_EVENT_START = "2020-10-13T00:00:00+05:30";
