import type { Instrument } from '../../shared/catalog';
import { fundFacts, skatSnapshot } from '../../shared/fund-facts';
import { number } from '../lib/format';
export function FundFacts({ item }: { item: Instrument }) {
  const facts = fundFacts(item);
  return (
    <div className="fund-facts">
      <p>
        <strong>ISIN:</strong> {item.isin || 'Not verified'}
      </p>
      {item.kind === 'ETF' && (
        <>
          <p>
            <strong>Annual fund cost:</strong>{' '}
            {facts.cost ? (
              <>
                {number(facts.cost.percent, 2)}% ·{' '}
                <a href={facts.cost.source} target="_blank" rel="noreferrer">
                  Issuer source
                </a>{' '}
                · checked {facts.cost.checkedAt}
              </>
            ) : (
              'Not verified'
            )}
          </p>
          <p>
            <strong>SKAT {skatSnapshot.year} equity-investment-company list:</strong>{' '}
            {facts.taxStatus === 'listed'
              ? 'Exact ISIN match'
              : facts.taxStatus === 'not-found'
                ? 'ISIN not found in the reviewed list'
                : 'Unverified for the current tax year'}
          </p>
          <p className="text-small muted">
            <a href={skatSnapshot.source} target="_blank" rel="noreferrer">
              Official list
            </a>{' '}
            published {skatSnapshot.publishedAt}; reviewed {skatSnapshot.reviewedAt}. Absence does
            not establish another tax classification or account eligibility.{' '}
            <a
              href="https://skat.dk/borger/aktier-og-andre-vaerdipapirer/skat-af-investeringsbeviser-udstedt-af-investeringsforeninger-og-investeringsselskaber"
              target="_blank"
              rel="noreferrer"
            >
              SKAT fund tax rules
            </a>
            .
          </p>
          <p className="text-small muted">
            Fund costs exclude broker and currency-conversion charges. Historical fund returns
            already reflect fund expenses.
          </p>
        </>
      )}
    </div>
  );
}
