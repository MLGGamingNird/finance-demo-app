import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency } from '../lib/format';
import { currentMonth, formatMonth } from '../lib/month';

// Categorical slots validated for colorblind separation against the
// page background (#0f172a). Income and spending are identities here,
// not good/bad states, so they don't use green/red.
const COLORS = {
  series1: '#3987e5',
  series2: '#d95926',
  textPrimary: '#e2e8f0',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  grid: '#1e293b',
  axis: '#334155',
  hover: 'rgba(148, 163, 184, 0.08)',
};

const SERIES = {
  income: { label: 'Income', color: COLORS.series1 },
  expenses: { label: 'Spending', color: COLORS.series2 },
};

const compactCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const shortMonth = (month) => formatMonth(month).split(' ')[0].slice(0, 3);

function ChartCard({ title, subtitle, table, children }) {
  const [showTable, setShowTable] = useState(false);

  return (
    <div className="chart-card">
      <div className="chart-header">
        <div>
          <h3>{title}</h3>
          {subtitle && <p className="chart-subtitle">{subtitle}</p>}
        </div>
        <button type="button" className="link" onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          {showTable ? 'View chart' : 'View as table'}
        </button>
      </div>
      {showTable ? table : children}
    </div>
  );
}

function ChartTooltip({ active, payload, label, labelFormatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{labelFormatter ? labelFormatter(label) : label}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="chart-tooltip-row">
          <span className="swatch" style={{ background: entry.color ?? entry.payload.fill }} />
          <span>{SERIES[entry.dataKey]?.label ?? 'Spent'}</span>
          <span className="chart-tooltip-value">{formatCurrency(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

function CategoryChart({ summary, categories }) {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const data = (summary?.spending_by_category ?? []).map((s) => ({
    name: names.get(s.category_id) ?? 'Uncategorized',
    spent: s.spent,
  }));

  const ROW_HEIGHT = 34;

  return (
    <ChartCard
      title="Spending by category"
      subtitle={summary ? formatMonth(summary.month) : null}
      table={
        <table className="chart-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Spent</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.name}>
                <td>{row.name}</td>
                <td>{formatCurrency(row.spent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      {data.length === 0 ? (
        <p className="empty">No spending this month</p>
      ) : (
        <ResponsiveContainer width="100%" height={data.length * ROW_HEIGHT + 8}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={104}
              tickLine={false}
              axisLine={{ stroke: COLORS.axis }}
              tick={{ fill: COLORS.textSecondary, fontSize: 13 }}
            />
            <Tooltip cursor={{ fill: COLORS.hover }} content={<ChartTooltip />} />
            <Bar dataKey="spent" fill={COLORS.series1} barSize={16} radius={[0, 4, 4, 0]} isAnimationActive={false}>
              <LabelList
                dataKey="spent"
                position="right"
                formatter={(v) => formatCurrency(v)}
                fill={COLORS.textSecondary}
                fontSize={12}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}

function TrendChart({ trend }) {
  const data = trend ?? [];

  return (
    <ChartCard
      title="Income vs. spending"
      subtitle={
        data.length
          ? `${formatMonth(data[0].month)} – ${formatMonth(data.at(-1).month)}${
              data.at(-1).month === currentMonth() ? ' (to date)' : ''
            }`
          : null
      }
      table={
        <table className="chart-table">
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Income</th>
              <th scope="col">Spending</th>
              <th scope="col">Net</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.month}>
                <td>{formatMonth(row.month)}</td>
                <td>{formatCurrency(row.income)}</td>
                <td>{formatCurrency(row.expenses)}</td>
                <td>{formatCurrency(row.income - row.expenses)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke={COLORS.grid} />
          <XAxis
            dataKey="month"
            tickFormatter={shortMonth}
            tickLine={false}
            axisLine={{ stroke: COLORS.axis }}
            tick={{ fill: COLORS.textSecondary, fontSize: 12 }}
          />
          <YAxis
            width={48}
            tickFormatter={(v) => compactCurrency.format(v)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: COLORS.textMuted, fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: COLORS.hover }}
            content={<ChartTooltip labelFormatter={formatMonth} />}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={28}
            iconType="circle"
            iconSize={8}
            formatter={(value) => <span style={{ color: COLORS.textSecondary, fontSize: 13 }}>{value}</span>}
          />
          {Object.entries(SERIES).map(([key, { label, color }]) => (
            <Bar
              key={key}
              dataKey={key}
              name={label}
              fill={color}
              maxBarSize={20}
              radius={[4, 4, 0, 0]}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// Default export so the dashboard can lazy-load Recharts.
export default function Charts({ summary, trend, categories }) {
  return (
    <section className="charts">
      <CategoryChart summary={summary} categories={categories} />
      <TrendChart trend={trend} />
    </section>
  );
}
