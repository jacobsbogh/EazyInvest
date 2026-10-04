import { instrumentSchema, providerInstrumentId, type Instrument } from './instrument.js';
import danishCatalog from './danish-listings.json' with { type: 'json' };
export type { Instrument } from './instrument.js';
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
// Names, tickers and venues checked against the SEC's listing metadata on
// 2026-10-04. A catalog entry does not imply provider history is available.
// https://www.sec.gov/files/company_tickers_exchange.json
const usListings = [
  ['NVDA', 'NVIDIA CORP', 'NASDAQ', '1045810'],
  ['AAPL', 'Apple Inc.', 'NASDAQ', '320193'],
  ['GOOGL', 'Alphabet Inc.', 'NASDAQ', '1652044'],
  ['AMZN', 'AMAZON COM INC', 'NASDAQ', '1018724'],
  ['META', 'Meta Platforms, Inc.', 'NASDAQ', '1326801'],
  ['TSLA', 'Tesla, Inc.', 'NASDAQ', '1318605'],
  ['AMD', 'ADVANCED MICRO DEVICES INC', 'NASDAQ', '2488'],
  ['JPM', 'JPMORGAN CHASE & CO', 'NYSE', '19617'],
  ['WMT', 'Walmart Inc.', 'NASDAQ', '104169'],
  ['V', 'VISA INC.', 'NYSE', '1403161'],
  ['XOM', 'ExxonMobil Holdings Corp', 'NYSE', '2115436'],
  ['JNJ', 'JOHNSON & JOHNSON', 'NYSE', '200406'],
  ['COST', 'COSTCO WHOLESALE CORP', 'NASDAQ', '909832'],
  ['KO', 'COCA COLA CO', 'NYSE', '21344'],
  ['PG', 'PROCTER & GAMBLE Co', 'NYSE', '80424'],
  ['UNH', 'UNITEDHEALTH GROUP INC', 'NYSE', '731766'],
  ['NFLX', 'NETFLIX INC', 'NASDAQ', '1065280'],
  ['DIS', 'Walt Disney Co', 'NYSE', '1744489'],
  ['PEP', 'PEPSICO INC', 'NASDAQ', '77476'],
] as const;
instruments.push(
  ...usListings.map(([ticker, name, exchange, cik]): Instrument => ({
    id: providerInstrumentId(ticker),
    ticker,
    name,
    shortName: name,
    exchange,
    currency: 'USD',
    kind: 'Stock',
    region: 'United States',
    description:
      'An individual company. Check its business, risks and exposure alongside your other holdings before investing.',
    isin: '',
    source: `https://www.sec.gov/edgar/browse/?CIK=${cik}`,
    sourceKind: 'provider',
    providerSymbol: ticker,
    color: '#396d6c',
  })),
);
export const getInstrument = (id: string, catalog: Instrument[] = instruments) => {
  const item = catalog.find((entry) => entry.id === id);
  if (!item) throw new Error('This investment is not in your catalog.');
  return item;
};

export const danishListings = danishCatalog.listings.map((item) => instrumentSchema.parse(item));
// Keep existing IDs and descriptions, especially Novo in saved transactions.
for (const listing of danishListings) {
  const index = instruments.findIndex((item) => item.id === listing.id);
  if (index >= 0)
    instruments[index] = {
      ...instruments[index],
      mic: listing.mic,
      yahooSymbol: listing.yahooSymbol,
    };
  else instruments.push(listing);
}
export const danishCatalogDate = danishCatalog.asOf;
