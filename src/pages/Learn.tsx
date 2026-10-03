import { useState } from 'react';
import { BookOpen, Check, ChevronDown, ArrowUpRight, Leaf } from 'lucide-react';
import { useApp } from '../lib/store';
import { PageHeading } from '../components/ui';
import { tax2026 } from '../../shared/tax';
import type { Workspace } from '../../shared/schema';

export const lessons: {
  id: Workspace['completedLessons'][number];
  category: string;
  title: string;
  time: string;
  intro: string;
  paragraphs: string[];
  takeaway: string;
  source?: string;
}[] = [
  {
    id: 'starting',
    category: 'THE FOUNDATIONS',
    title: 'What is investing, really?',
    time: '3 min',
    intro: 'Give your money a job, and understand the uncertainty that comes with it.',
    paragraphs: [
      'When you buy a share, you own a small part of a company. When you buy a fund, your money is pooled into a collection of investments. Their value can rise or fall, and some may pay income along the way.',
      'Saving and investing serve different needs. Money you need soon, or for an unexpected bill, needs to be accessible without depending on a favorable market price. Start by separating that money from your long-term plan.',
      'A useful first question is not “which share will rise?” but “what is this money for, and how long can I leave it invested?” Your timeframe and ability to absorb losses shape the choices worth considering.',
    ],
    takeaway: 'Write down one goal, its timeframe, and the money you need to keep available.',
  },
  {
    id: 'compounding',
    category: 'TIME & CONSISTENCY',
    title: 'Why time makes a difference',
    time: '3 min',
    intro: 'Compounding means returns can themselves earn returns. Losses compound, too.',
    paragraphs: [
      'Imagine DKK 10,000 growing by an assumed 5% in one year. It becomes DKK 10,500. If it grew by 5% again, that second increase would be DKK 525. This is a mathematical example, not a promised return.',
      'Markets do not grow smoothly. A 20% gain followed by a 20% loss leaves you with 96% of your starting value. The sequence matters even more when you add or withdraw money.',
      'Regular contributions make your habit visible and reduce the need to make a fresh timing decision each month. They do not remove market risk. Use the planner’s crash scenario to see why the journey matters.',
    ],
    takeaway: 'Compare 10 years and 20 years in the planner. Then switch on the market shock.',
  },
  {
    id: 'diversification',
    category: 'UNDERSTANDING RISK',
    title: 'Spread your exposure',
    time: '4 min',
    intro: 'More investments help only when they actually add different exposure.',
    paragraphs: [
      'Diversification spreads dependence across companies, sectors, countries, and potentially asset types. It can reduce the impact of one company failing, but broad markets can still fall together.',
      'An ETF is a fund whose shares trade on an exchange. Some ETFs contain thousands of companies; others concentrate on a narrow theme. The wrapper alone does not make an investment diversified or suitable.',
      'Two funds can own many of the same companies. Adding a US index fund to a world index fund may increase your US exposure rather than add much new diversification. Check the holdings and country weights.',
    ],
    takeaway:
      'For each investment, explain what it owns and what it adds to the rest of your portfolio.',
  },
  {
    id: 'costs',
    category: 'THE DETAILS THAT ADD UP',
    title: 'Fees, inflation & the real result',
    time: '3 min',
    intro: 'The number on your account is only one part of the story.',
    paragraphs: [
      'Costs can include the fund’s ongoing charges, dealing commissions, the gap between buy and sell prices, custody charges, and currency conversion. Their impact depends on how much you invest and how often you trade.',
      'Inflation reduces purchasing power. A larger future balance may buy less than you imagine. The planner’s “today’s DKK” option translates future values using your chosen inflation assumption.',
      'Your personal DKK return can differ from a fund’s return in EUR or USD. The currency used to trade an investment is not necessarily the currency exposure of its underlying assets.',
    ],
    takeaway: 'Try the same plan with 0.3% and 1.5% annual fees, then adjust for inflation.',
  },
  {
    id: 'danish-tax',
    category: 'INVESTING FROM DENMARK',
    title: 'Get familiar with Danish accounts',
    time: '4 min',
    intro: 'Account type and investment classification can change how and when you pay tax.',
    paragraphs: [
      'An aktiesparekonto has its own deposit rules and a 17% annual tax on returns under the current rules. The bank normally calculates and pays that tax for you. It is not simply a normal investment account with a lower tax rate.',
      'Lagerbeskatning means gains and losses are measured annually, including changes on investments you still own. Realisationsbeskatning generally means a gain or loss is recognized when you sell; dividends can still be taxed before then.',
      'An investment’s Danish classification matters. SKAT’s list of equity-based investment companies is a tax reference, not a list of recommended or low-risk investments. Verify the ISIN and applicable tax year.',
    ],
    takeaway: 'Read the Denmark page before choosing a tax model for a specific investment.',
    source: tax2026.askSource,
  },
  {
    id: 'behavior',
    category: 'STAYING THE COURSE',
    title: 'Build a plan you can live with',
    time: '3 min',
    intro: 'A plan needs to work for you during difficult markets, too.',
    paragraphs: [
      'Risk tolerance describes your comfort with uncertainty. Risk capacity describes what your finances can actually withstand. A long horizon does not make every investment appropriate, and money needed for essential spending has a different role.',
      'Write down why you own something, what could go wrong, and what would justify changing your view. Your watchlist notes are a good place to separate a considered reason from excitement about a recent price move.',
      'Choose a sensible review rhythm. Check whether your goals, circumstances, and allocation have changed. Daily price movements rarely explain your entire long-term plan.',
    ],
    takeaway:
      'Write a short personal investing checklist before recording your first real purchase.',
  },
];
export default function Learn() {
  const { data, update, saving } = useApp();
  const [open, setOpen] = useState<string | null>(
    lessons.find((l) => !data.completedLessons.includes(l.id))?.id ?? 'starting',
  );
  return (
    <>
      <PageHeading
        eyebrow="CONFIDENCE COMES FROM UNDERSTANDING"
        title="Start curious. Grow confident."
        description="Six short lessons to help you make sense of investing, one idea at a time."
      />
      <section className="learning-hero">
        <div className="learning-hero-icon">
          <BookOpen size={36} />
        </div>
        <div>
          <div className="eyebrow">YOUR INVESTING FOUNDATIONS</div>
          <h2>No jargon required.</h2>
          <p>
            You already know how to learn something complex. Start small, ask questions, and build
            on what you understand.
          </p>
        </div>
        <div className="learning-count">
          <strong>
            {data.completedLessons.length}
            <span>/6</span>
          </strong>
          <span>lessons completed</span>
        </div>
      </section>
      <div className="lesson-list">
        {lessons.map((lesson, index) => {
          const done = data.completedLessons.includes(lesson.id);
          return (
            <section
              className={`card lesson-card ${open === lesson.id ? 'expanded' : ''}`}
              key={lesson.id}
            >
              <button
                className="lesson-heading"
                aria-expanded={open === lesson.id}
                onClick={() => setOpen(open === lesson.id ? null : lesson.id)}
              >
                <span className={`lesson-number ${done ? 'done' : ''}`}>
                  {done ? <Check size={22} /> : String(index + 1).padStart(2, '0')}
                </span>
                <span>
                  <span className="eyebrow">{lesson.category}</span>
                  <h2>{lesson.title}</h2>
                  <p>{lesson.intro}</p>
                </span>
                <span className="lesson-time">{lesson.time}</span>
                <ChevronDown size={19} />
              </button>
              {open === lesson.id && (
                <div className="lesson-body">
                  {lesson.paragraphs.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                  <div className="takeaway">
                    <Leaf size={20} />
                    <div>
                      <strong>Make it practical</strong>
                      <p>{lesson.takeaway}</p>
                    </div>
                  </div>
                  <div className="lesson-actions">
                    <button
                      className={`button ${done ? 'secondary' : 'primary'}`}
                      disabled={saving}
                      onClick={() =>
                        void update((old) => ({
                          ...old,
                          completedLessons: done
                            ? old.completedLessons.filter((id) => id !== lesson.id)
                            : [...old.completedLessons, lesson.id],
                        }))
                      }
                    >
                      <Check size={16} />
                      {done ? 'Completed · mark unread' : 'Mark as understood'}
                    </button>
                    {lesson.source && (
                      <a href={lesson.source} target="_blank" rel="noreferrer">
                        Read the official rules <ArrowUpRight size={14} />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
