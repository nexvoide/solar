"use client";

import { useSettings } from "@/components/SettingsProvider";
import AnimatedValue from "@/components/dashboard/AnimatedValue";

interface SummaryCardProps {
  icon: React.ReactNode;
  value: string;
  label: string;
  accent?: "mint" | "blue";
}

export function SummaryCard({ icon, value, label, accent = "mint" }: SummaryCardProps) {
  const iconBg = accent === "mint" ? "bg-[#5dffc0]/15 text-[#5dffc0]" : "bg-sky-500/15 text-sky-400";

  return (
    <div className="knox-card flex flex-col gap-3 rounded-2xl p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums text-white">
          <AnimatedValue value={value} />
        </p>
        <p className="mt-1 text-xs leading-snug text-slate-400">{label}</p>
      </div>
    </div>
  );
}

export function LoadIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M6 7V5a2 2 0 012-2h8a2 2 0 012 2v2" />
      <line x1="12" y1="12" x2="12" y2="16" />
      <line x1="10" y1="14" x2="14" y2="14" />
    </svg>
  );
}

export function SolarIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export type NavTab = "overview" | "details" | "stats" | "more";

interface BottomNavProps {
  active: NavTab;
  onChange: (tab: NavTab) => void;
  onSettings: () => void;
}

export function BottomNav({ active, onChange, onSettings }: BottomNavProps) {
  const { t } = useSettings();

  const tabs: { id: NavTab; label: string; icon: React.ReactNode; action?: () => void }[] = [
    {
      id: "overview",
      label: t("navOverview"),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 10.5L12 3l9 7.5V20a1 1 0 01-1 1H5a1 1 0 01-1-1V10.5z" />
          <path d="M9 21V12h6v9" />
        </svg>
      ),
    },
    {
      id: "details",
      label: t("navDetails"),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      ),
    },
    {
      id: "stats",
      label: t("navStats"),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 019 9" />
          <path d="M12 12L18 8" />
        </svg>
      ),
    },
    {
      id: "more",
      label: t("navMore"),
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
          <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
        </svg>
      ),
      action: onSettings,
    },
  ];

  return (
    <nav className="knox-bottom-nav fixed inset-x-0 bottom-0 z-30 mx-auto max-w-lg px-4 pb-[calc(0.75rem+var(--safe-bottom))]">
      <div className="flex items-center justify-around rounded-full px-2 py-2">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => (tab.action ? tab.action() : onChange(tab.id))}
              className={`flex flex-col items-center gap-0.5 rounded-2xl px-3 py-2 transition sm:px-4 ${
                isActive ? "text-[#5dffc0]" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              <span className={isActive ? "drop-shadow-[0_0_8px_rgba(93,255,192,0.6)]" : ""}>
                {tab.icon}
              </span>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
