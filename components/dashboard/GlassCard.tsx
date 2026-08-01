"use client";

import type { ReactNode } from "react";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  accent?: "solar" | "home" | "grid" | "live" | "neutral";
  refreshing?: boolean;
  pulse?: boolean;
  onClick?: () => void;
}

const accentStyles = {
  solar: "before:bg-gradient-to-r before:from-amber-400/80 before:to-orange-500/80",
  home: "before:bg-gradient-to-r before:from-sky-400/80 before:to-blue-500/80",
  grid: "before:bg-gradient-to-r before:from-violet-400/80 before:to-purple-500/80",
  live: "before:bg-gradient-to-r before:from-emerald-400/80 before:to-teal-500/80",
  neutral: "before:bg-gradient-to-r before:from-slate-400/50 before:to-slate-500/50",
};

export default function GlassCard({
  children,
  className = "",
  accent,
  refreshing = false,
  pulse = false,
  onClick,
}: GlassCardProps) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`glass relative overflow-hidden p-5 text-start sm:p-6 ${
        accent ? `before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:content-[''] ${accentStyles[accent]}` : ""
      } ${refreshing ? "glass-refreshing" : ""} ${pulse ? "glass-pulse" : ""} ${className}`}
    >
      {children}
    </Tag>
  );
}

interface MetricRowProps {
  label: string;
  value: string;
}

export function MetricRow({ label, value }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/[0.06] py-3 last:border-0">
      <span className="text-sm text-slate-400">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-slate-100">{value}</span>
    </div>
  );
}

interface HeroMetricProps {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  accent: GlassCardProps["accent"];
  refreshing?: boolean;
  pulse?: boolean;
  large?: boolean;
}

export function HeroMetric({
  icon,
  label,
  value,
  hint,
  accent,
  refreshing,
  pulse,
  large,
}: HeroMetricProps) {
  return (
    <GlassCard accent={accent} refreshing={refreshing} pulse={pulse} className="h-full">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-2xl">
            {icon}
          </div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            {label}
          </p>
        </div>
        <div
          className={`font-bold tracking-tight text-white ${
            large ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl"
          }`}
        >
          {value}
        </div>
        {hint && <p className="text-sm leading-relaxed text-slate-500">{hint}</p>}
      </div>
    </GlassCard>
  );
}

interface SectionTitleProps {
  icon: ReactNode;
  title: string;
  color?: string;
}

export function SectionTitle({ icon, title, color = "text-slate-300" }: SectionTitleProps) {
  return (
    <div className={`mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider ${color}`}>
      <span className="text-lg">{icon}</span>
      {title}
    </div>
  );
}
