import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  ReferenceLine,
} from 'recharts';
import type { Plan } from '../../shared/schema';
import { scenarios } from '../../shared/finance';
import { money, number } from '../lib/format';
const grid = '#e8ebe3';
export function StrategyChart({
  results,
  names,
}: {
  results: import('../../shared/portfolio-history').StrategyResult[];
  names: string[];
}) {
  const data = results[0].points.map((p, i) => ({
    date: p.month,
    cash: p.contributed,
    first: p.value,
    second: results[1]?.points[i].value,
  }));
  return (
    <div
      className="chart"
      role="img"
      aria-label="Historical portfolio values in DKK compared with contributions held as cash at zero interest"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 16, right: 8, left: 4, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis dataKey="date" minTickGap={45} tick={{ fontSize: 11 }} />
          <YAxis
            width={65}
            tickFormatter={(v) => `${number(v / 1000, 0)}k`}
            tick={{ fontSize: 11 }}
          />
          <Tooltip formatter={(v) => money(Number(v))} />
          <Line
            dataKey="first"
            name={names[0]}
            stroke="#3e6950"
            strokeWidth={2.5}
            dot={false}
            isAnimationActive={false}
          />
          {results[1] && (
            <Line
              dataKey="second"
              name={names[1]}
              stroke="#506579"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          )}
          <Line
            dataKey="cash"
            name="Contributions / cash at 0%"
            stroke="#777769"
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
export function ProjectionChart({ plan, crash = false }: { plan: Plan; crash?: boolean }) {
  const data = scenarios(plan, crash);
  return (
    <div
      className="chart"
      role="img"
      aria-label={`Projected investment after ${plan.years} years: ${money(data.at(-1)!.value)} in the base scenario. Lower and higher scenarios are assumptions, not probabilities.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 16, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="growth-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9bc27f" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#e4edcd" stopOpacity={0.15} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis
            dataKey="year"
            tickLine={false}
            axisLine={false}
            minTickGap={30}
            tickFormatter={(v) => `${v} yr`}
            tick={{ fill: '#7b8278', fontSize: 11 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={63}
            tickFormatter={(v) => `${number(v / 1000, 0)}k`}
            tick={{ fill: '#7b8278', fontSize: 11 }}
          />
          <Tooltip
            formatter={(value) => money(Number(value))}
            labelFormatter={(v) => `Year ${v}`}
            contentStyle={{ borderRadius: 12, borderColor: grid, fontSize: 12 }}
          />
          <Area
            type="monotone"
            dataKey="high"
            name="Higher scenario"
            stroke="#b7c5a6"
            strokeDasharray="4 5"
            fill="transparent"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="value"
            name="Base scenario"
            stroke="#3e6950"
            strokeWidth={2.5}
            fill="url(#growth-fill)"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="low"
            name="Lower scenario"
            stroke="#9aab8e"
            strokeDasharray="4 5"
            fill="transparent"
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="contributed"
            name="Contributions"
            stroke="#aaa99e"
            strokeWidth={1.5}
            strokeDasharray="3 3"
            fill="transparent"
            isAnimationActive={false}
          />
          {crash && (
            <ReferenceLine
              x={2}
              stroke="#b57c59"
              label={{
                value: '−35% shock',
                position: 'insideTopRight',
                fill: '#9f6647',
                fontSize: 11,
              }}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
export function PriceChart({
  data,
  keys,
  currency = false,
  adjusted = false,
  unit = 'trading currency',
}: {
  data: Record<string, number | string>[];
  keys: { id: string; name: string; color: string }[];
  currency?: boolean;
  adjusted?: boolean;
  unit?: string;
}) {
  return (
    <div
      className="chart price-chart"
      role="img"
      aria-label={`${adjusted ? 'Adjusted history accounting for splits and dividends' : 'Price history'} ${currency ? `in ${unit}` : `indexed to 100 at the first common observation (${unit})`}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={grid} vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            minTickGap={55}
            tickFormatter={(v) => String(v).slice(0, 7)}
            tick={{ fill: '#7b8278', fontSize: 11 }}
          />
          <YAxis
            domain={['auto', 'auto']}
            width={50}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => number(v, 0)}
            tick={{ fill: '#7b8278', fontSize: 11 }}
          />
          <Tooltip
            formatter={(value) => `${number(Number(value))}${currency ? ` ${unit}` : ' (index)'}`}
            contentStyle={{ borderRadius: 12, borderColor: grid }}
          />
          {keys.map((key) => (
            <Line
              key={key.id}
              dataKey={key.id}
              name={key.name}
              stroke={key.color}
              dot={false}
              strokeWidth={2.5}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
