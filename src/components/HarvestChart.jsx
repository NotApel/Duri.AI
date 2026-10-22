import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// Original weekly demonstration dataset, independent of event fixtures.
const harvestData = [
  { day: "Mon", drops: 4 },
  { day: "Tue", drops: 7 },
  { day: "Wed", drops: 3 },
  { day: "Thu", drops: 11 },
  { day: "Fri", drops: 8 },
  { day: "Sat", drops: 14 },
  { day: "Sun", drops: 9 },
];
export default function HarvestChart() {
  return (
    <section className="ui-panel" aria-label="Simulated weekly yield chart">
      <h2>Weekly yield trends · sample data</h2>
      <p className="ui-muted mb-4">
        Original presentation dataset. These sample counts are separate from the
        five simulated detection records above.
      </p>
      <div
        className="h-64 w-full"
        role="img"
        aria-label="Sample weekly drop counts: Monday 4, Tuesday 7, Wednesday 3, Thursday 11, Friday 8, Saturday 14, Sunday 9."
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={harvestData}
            margin={{ top: 12, right: 16, left: -20, bottom: 8 }}
          >
            <CartesianGrid
              stroke="#b6b265"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis dataKey="day" stroke="#37583a" fontSize={12} />
            <YAxis allowDecimals={false} stroke="#37583a" fontSize={12} />
            <Tooltip
              contentStyle={{
                background: "var(--ui-surface)",
                border: "1px solid #b6b265",
                borderRadius: 6,
                color: "#37583a",
              }}
            />
            <Area
              type="monotone"
              dataKey="drops"
              name="Sample drops"
              stroke="#37583a"
              fill="#b6b265"
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
