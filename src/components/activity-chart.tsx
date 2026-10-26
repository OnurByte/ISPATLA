"use client";
import {useUiText} from "@/i18n/ui-client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ActivityPoint } from "@/server/db-types";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  const {t,locale}=useUiText();
  if (data.length === 0) {
    return (
      <Empty className="h-[240px] border border-dashed">
        <EmptyHeader>
          <EmptyTitle>{t('No signals yet')}</EmptyTitle>
          <EmptyDescription>{t('The signal chart appears after the first scan.')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <defs>
            <linearGradient id="observed-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
          <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(value: string) => {
            const date = new Date(`${value}T12:00:00Z`);
            return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(date);
          }} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickFormatter={(value: number) => new Intl.NumberFormat(locale).format(value)} />
          <Tooltip
            formatter={(value) => typeof value === "number" ? new Intl.NumberFormat(locale).format(value) : value}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              color: "var(--popover-foreground)",
            }}
          />
          <Area type="monotone" dataKey="observed" name={t('Observed')} stroke="var(--chart-2)" fill="url(#observed-fill)" strokeWidth={2} />
          <Area type="monotone" dataKey="opportunities" name={t('Opportunity')} stroke="var(--chart-4)" fill="transparent" strokeWidth={2} strokeDasharray="5 5" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
