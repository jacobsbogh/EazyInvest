# Danish market coverage

The research has been implemented. See [free Danish data](FREE_DANISH_DATA.md) for the complete source choices, the 146-listing catalogue and its verified mappings, data semantics, verification and release sequence.

Nasdaq Nordic is the official exchange source. Its free delayed CSV trade reports have short retention and cannot supply a decades-long adjusted archive. This implementation uses Nasdaq trade reports as a separately labelled exchange reference, ESMA as the official listing register, and Yahoo for historical trends. Historical data is never labelled as exchange-official.

Sources: [Nasdaq delayed-data documentation](https://www.nasdaq.com/market-regulation/nordic/mifid-ii), [Nasdaq report portal](https://tradereports.nasdaq.com/shares/trade-reports/post-trade), [ESMA MiFIR reporting](https://www.esma.europa.eu/data-reporting/mifir-reporting), [Yahoo adjusted-close explanation](https://in.help.yahoo.com/kb/finance/adjusted-close-sln28256.html).
