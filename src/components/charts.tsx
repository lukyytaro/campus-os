"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Baca class "dark" di <html> agar warna chart mengikuti tema. */
function useIsDark(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const el = document.documentElement;
    const update = () => setDark(el.classList.contains("dark"));
    update();
    const observer = new MutationObserver(update);
    observer.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

function chartColors(dark: boolean) {
  return {
    grid: dark ? "#27272a" : "#e4e4e7",
    tick: dark ? "#a1a1aa" : "#71717a",
    tooltipBg: dark ? "#18181b" : "#ffffff",
    tooltipBorder: dark ? "#3f3f46" : "#e4e4e7",
    tooltipText: dark ? "#fafafa" : "#18181b",
  };
}

const TOOLTIP_STYLE = (c: ReturnType<typeof chartColors>) => ({
  backgroundColor: c.tooltipBg,
  border: `1px solid ${c.tooltipBorder}`,
  borderRadius: 10,
  fontSize: 13,
  color: c.tooltipText,
  boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
});

/* ------------------------------------------------------------------ */
/* Perkembangan IP per semester (garis)                                */
/* ------------------------------------------------------------------ */

export function GpaLineChart({
  data,
}: {
  data: { semester: number; ip: number }[];
}) {
  const dark = useIsDark();
  const c = chartColors(dark);
  const rows = data.map((d) => ({ name: `Sem ${d.semester}`, ip: d.ip }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: c.tick, fontSize: 12 }}
            axisLine={{ stroke: c.grid }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 4]}
            ticks={[0, 1, 2, 3, 4]}
            tick={{ fill: c.tick, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE(c)}
            formatter={(value) => [
              Number(value).toLocaleString("id-ID", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
              "IP",
            ]}
          />
          <Line
            type="monotone"
            dataKey="ip"
            stroke="#2563EB"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "#2563EB", strokeWidth: 0 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Jam belajar per minggu (batang)                                     */
/* ------------------------------------------------------------------ */

export function WeeklyStudyBarChart({
  data,
}: {
  data: { week: string; hours: number }[];
}) {
  const dark = useIsDark();
  const c = chartColors(dark);
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 6" vertical={false} />
          <XAxis
            dataKey="week"
            tick={{ fill: c.tick, fontSize: 12 }}
            axisLine={{ stroke: c.grid }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: c.tick, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}j`}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE(c)}
            formatter={(value) => [
              `${Number(value).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jam`,
              "Belajar",
            ]}
          />
          <Bar dataKey="hours" fill="#2563EB" radius={[6, 6, 0, 0]} maxBarSize={44} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progres tugas (donat)                                               */
/* ------------------------------------------------------------------ */

const DONUT_COLORS = {
  selesai: "#2563EB",
  proses: "#D97706",
  belum: "#A1A1AA",
};

export function TaskDonutChart({
  data,
}: {
  data: { status: "selesai" | "proses" | "belum"; count: number }[];
}) {
  const dark = useIsDark();
  const c = chartColors(dark);
  const rows = data
    .filter((d) => d.count > 0)
    .map((d) => ({
      name:
        d.status === "selesai"
          ? "Selesai"
          : d.status === "proses"
            ? "Dikerjakan"
            : "Belum dikerjakan",
      value: d.count,
      fill: DONUT_COLORS[d.status],
    }));
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  if (total === 0) return null;
  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip contentStyle={TOOLTIP_STYLE(c)} />
            <Pie
              data={rows}
              dataKey="value"
              nameKey="name"
              innerRadius={52}
              outerRadius={80}
              paddingAngle={2}
              strokeWidth={0}
            >
              {rows.map((row) => (
                <Cell key={row.name} fill={row.fill} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-2">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center justify-between gap-4 text-sm">
            <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: row.fill }}
                aria-hidden="true"
              />
              {row.name}
            </span>
            <span className="font-medium text-zinc-900 tabular-nums dark:text-zinc-50">
              {row.value} tugas
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
