import { ProviderError } from './alpha-vantage.js';

// Public requests only: no cookies, login, proxy rotation or access-block bypass.
export async function publicFetch(url: URL | string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(25000) });
  } catch {
    throw new ProviderError('unavailable', 'Public data source did not respond.');
  }
  if (response.status === 429)
    throw new ProviderError('quota', 'Public data source requested a pause.');
  if (response.status === 404) throw new ProviderError('coverage', 'This listing is unavailable.');
  if (!response.ok) throw new ProviderError('unavailable', 'Public data source is unavailable.');
  return response;
}
