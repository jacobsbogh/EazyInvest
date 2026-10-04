import { ProviderError } from './alpha-vantage.js';

// No URLs, response payloads or credentials are included in errors or logs.
export async function requestAlpha(
  apiKey: string,
  consumeCredit: () => Promise<void>,
  parameters: Record<string, string>,
): Promise<unknown> {
  if (!apiKey || apiKey === 'demo') throw new ProviderError('invalid');
  await consumeCredit();
  const url = new URL('https://www.alphavantage.co/query');
  url.search = new URLSearchParams({ ...parameters, apikey: apiKey }).toString();
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new ProviderError('unavailable');
  const body: unknown = await response.json();
  if (typeof body === 'object' && body !== null) {
    if ('Information' in body || 'Note' in body) {
      const message = 'Information' in body ? body.Information : 'Note' in body ? body.Note : '';
      throw new ProviderError(
        typeof message === 'string' &&
          /premium|subscribe|subscription/iu.test(message) &&
          !/rate limit|call frequency|requests per|requests\/day|reached.{0,20}limit/iu.test(
            message,
          )
          ? 'coverage'
          : 'quota',
      );
    }
    if ('Error Message' in body) throw new ProviderError('coverage');
  }
  return body;
}
