export const tax2026 = {
  year: 2026,
  checked: '2026-09-29',
  askRate: 0.17,
  askLimit: 174200,
  equityLow: 0.27,
  equityHigh: 0.42,
  equityThreshold: 79400,
  askSource: 'https://skat.dk/borger/aktier-og-andre-vaerdipapirer/aktiesparekonto',
  equitySource: 'https://skat.dk/borger/aktier-og-andre-vaerdipapirer/skat-af-aktier',
  fundSource:
    'https://skat.dk/borger/aktier-og-andre-vaerdipapirer/skat-af-investeringsbeviser-udstedt-af-investeringsforeninger-og-investeringsselskaber',
  listSource:
    'https://skat.dk/erhverv/ekapital/vaerdipapirer/beviser-og-aktier-i-investeringsforeninger-og-selskaber-ifpa',
};
export function equityTax(gain: number, married = false): number {
  const threshold = tax2026.equityThreshold * (married ? 2 : 1);
  return (
    Math.min(Math.max(0, gain), threshold) * tax2026.equityLow +
    Math.max(0, gain - threshold) * tax2026.equityHigh
  );
}
export function askRoom(previousYearEnd: number, netDeposits: number): number {
  return Math.max(0, tax2026.askLimit - previousYearEnd - netDeposits);
}
