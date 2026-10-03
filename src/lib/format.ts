export const money = (value: number | null, compact = false) =>
  value === null
    ? 'Not available'
    : new Intl.NumberFormat('en-DK', {
        style: 'currency',
        currency: 'DKK',
        maximumFractionDigits: 0,
        notation: compact ? 'compact' : 'standard',
      }).format(value);
export const number = (value: number, digits = 2) =>
  new Intl.NumberFormat('en-DK', { maximumFractionDigits: digits }).format(value);
export const percent = (value: number) => `${value > 0 ? '+' : ''}${number(value * 100, 1)}%`;
export const date = (value: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
