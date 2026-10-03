import type { InstrumentId } from './schema.js';
export type Instrument = {
  id: InstrumentId;
  name: string;
  shortName: string;
  ticker: string;
  exchange: string;
  currency: 'EUR' | 'USD' | 'DKK';
  kind: 'ETF' | 'Stock';
  region: string;
  description: string;
  isin: string;
  source: string;
  color: string;
};
export const instruments: Instrument[] = [
  {
    id: 'vwce',
    name: 'Vanguard FTSE All-World UCITS ETF',
    shortName: 'All-world equities',
    ticker: 'VWCE',
    exchange: 'XETR',
    currency: 'EUR',
    kind: 'ETF',
    region: 'Global',
    description:
      'A fund following large and mid-sized companies across developed and emerging markets. One holding can spread exposure across many businesses.',
    isin: 'IE00BK5BQT80',
    source:
      'https://www.ie.vanguard/products/etf/equity/9679/ftse-all-world-ucits-etf-usd-accumulating',
    color: '#476d59',
  },
  {
    id: 'eunl',
    name: 'iShares Core MSCI World UCITS ETF',
    shortName: 'Developed markets',
    ticker: 'EUNL',
    exchange: 'XETR',
    currency: 'EUR',
    kind: 'ETF',
    region: 'Developed',
    description:
      'Tracks equities in developed markets. It does not provide the same emerging-market exposure as an all-world fund.',
    isin: 'IE00B4L5Y983',
    source: 'https://www.ishares.com/',
    color: '#5f744f',
  },
  {
    id: 'is3n',
    name: 'iShares Core MSCI EM IMI UCITS ETF',
    shortName: 'Emerging markets',
    ticker: 'IS3N',
    exchange: 'XETR',
    currency: 'EUR',
    kind: 'ETF',
    region: 'Emerging',
    description:
      'Exposure to companies in emerging markets, including smaller companies. Political, currency, and market risks can differ from developed markets.',
    isin: 'IE00BKM4GZ66',
    source: 'https://www.ishares.com/',
    color: '#83612e',
  },
  {
    id: 'sxr8',
    name: 'iShares Core S&P 500 UCITS ETF',
    shortName: 'US large companies',
    ticker: 'SXR8',
    exchange: 'XETR',
    currency: 'EUR',
    kind: 'ETF',
    region: 'United States',
    description:
      'Tracks the S&P 500. A large number of holdings still leaves concentration in one country and in its largest companies.',
    isin: 'IE00B5BMR087',
    source: 'https://www.ishares.com/',
    color: '#506579',
  },
  {
    id: 'novo',
    name: 'Novo Nordisk B',
    shortName: 'Novo Nordisk',
    ticker: 'NOVO B',
    exchange: 'OMXC',
    currency: 'DKK',
    kind: 'Stock',
    region: 'Denmark',
    description:
      'An individual healthcare company. Its results and share price depend on company-specific events as well as the wider market.',
    isin: 'DK0062498333',
    source: 'https://www.novonordisk.com/investors.html',
    color: '#765b7e',
  },
  {
    id: 'msft',
    name: 'Microsoft',
    shortName: 'Microsoft',
    ticker: 'MSFT',
    exchange: 'NASDAQ',
    currency: 'USD',
    kind: 'Stock',
    region: 'United States',
    description:
      'An individual technology company. Owning it alongside broad equity funds may increase exposure you already have through those funds.',
    isin: 'US5949181045',
    source: 'https://www.microsoft.com/en-us/Investor/',
    color: '#396d6c',
  },
];
export const getInstrument = (id: InstrumentId) => instruments.find((item) => item.id === id)!;
