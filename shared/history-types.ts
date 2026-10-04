// One observed close (or provider-adjusted close) expressed in the analysis currency.
// This is a return-series value, not a broker execution price or a unit count.
export type HistoryObservation = { date: string; value: number };
