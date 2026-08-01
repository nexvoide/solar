"use client";

import { useSettings } from "@/components/SettingsProvider";
import { formatPower } from "@/lib/formatPower";
import type { FieldReading } from "@/lib/knox";

interface FlowBubbleProps {
  label: string;
  value: string;
  className?: string;
}

function FlowBubble({ label, value, className = "" }: FlowBubbleProps) {
  return (
    <div
      className={`knox-bubble flex min-w-[88px] items-center gap-2 rounded-xl px-3 py-2 shadow-lg ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-sm font-bold tabular-nums text-white">{value}</p>
      </div>
      <span className="text-slate-500">›</span>
    </div>
  );
}

interface IsometricHomeSceneProps {
  pvPower: FieldReading;
  loadPower: FieldReading;
  gridConnected: boolean;
  isGenerating: boolean;
}

export default function IsometricHomeScene({
  pvPower,
  loadPower,
  gridConnected,
  isGenerating,
}: IsometricHomeSceneProps) {
  const { t, unit } = useSettings();

  const pvDisplay = formatPower(pvPower.value, pvPower.unit, unit);
  const loadDisplay = formatPower(loadPower.value, loadPower.unit, unit);
  const gridDisplay = gridConnected ? t("gridConnected") : "—";

  const glow = isGenerating ? "#5dffc0" : "#3d4f6f";
  const glowOpacity = isGenerating ? 0.9 : 0.35;

  return (
    <div className="relative mx-auto w-full max-w-sm py-2">
      {/* Floating stat bubbles — Knox app style */}
      <FlowBubble label={t("grid")} value={gridDisplay} className="absolute left-0 top-0 z-10" />
      <FlowBubble label="PV" value={pvDisplay} className="absolute right-0 top-2 z-10" />
      <FlowBubble label={t("load")} value={loadDisplay} className="absolute bottom-16 right-0 z-10" />

      <svg
        viewBox="0 0 360 280"
        className="mx-auto w-full"
        aria-hidden
        role="img"
      >
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="roofGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#4a5568" />
            <stop offset="100%" stopColor="#2d3748" />
          </linearGradient>
          <linearGradient id="panelGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e3a5f" />
            <stop offset="100%" stopColor="#0f2744" />
          </linearGradient>
        </defs>

        {/* Energy flow lines */}
        <g filter="url(#glow)" opacity={glowOpacity}>
          {/* Grid → inverter */}
          <path
            d="M 55 175 Q 120 160 175 195"
            fill="none"
            stroke={glow}
            strokeWidth="2.5"
            className={isGenerating ? "knox-flow-line" : ""}
          />
          {/* Solar → inverter */}
          <path
            d="M 200 95 Q 200 140 195 175"
            fill="none"
            stroke={glow}
            strokeWidth="2.5"
            className={isGenerating ? "knox-flow-line" : ""}
          />
          {/* Inverter → home load */}
          <path
            d="M 210 195 Q 250 200 280 170"
            fill="none"
            stroke={glow}
            strokeWidth="2.5"
            className={isGenerating ? "knox-flow-line knox-flow-delay" : ""}
          />
        </g>

        {/* Grid tower — left */}
        <g transform="translate(30, 120)">
          <rect x="18" y="40" width="6" height="50" fill="#4a5568" />
          <line x1="0" y1="45" x2="42" y2="30" stroke="#718096" strokeWidth="2" />
          <line x1="0" y1="60" x2="42" y2="45" stroke="#718096" strokeWidth="2" />
          <line x1="0" y1="75" x2="42" y2="60" stroke="#718096" strokeWidth="2" />
          <rect x="14" y="88" width="14" height="8" rx="1" fill="#2d3748" />
        </g>

        {/* Isometric house */}
        <g transform="translate(130, 80)">
          {/* House body */}
          <path d="M 20 90 L 100 90 L 100 150 L 20 150 Z" fill="#3d4a5c" />
          <path d="M 20 90 L 60 55 L 100 90 Z" fill="url(#roofGrad)" />
          {/* Solar panels on roof */}
          <path d="M 28 78 L 52 62 L 76 78 L 52 94 Z" fill="url(#panelGrad)" stroke="#5dffc0" strokeWidth="0.5" opacity="0.9" />
          <path d="M 54 62 L 78 78 L 92 68 L 68 52 Z" fill="url(#panelGrad)" stroke="#5dffc0" strokeWidth="0.5" opacity="0.9" />
          {/* Door */}
          <rect x="48" y="118" width="18" height="32" rx="1" fill="#2d3748" />
          {/* Windows */}
          <rect x="28" y="105" width="16" height="14" rx="1" fill="#63b3ed" opacity="0.5" />
          <rect x="76" y="105" width="16" height="14" rx="1" fill="#63b3ed" opacity="0.5" />
        </g>

        {/* Inverter box */}
        <g transform="translate(175, 175)">
          <rect x="0" y="0" width="36" height="28" rx="3" fill="#2d3748" stroke="#5dffc0" strokeWidth="1" opacity="0.9" />
          <rect x="6" y="6" width="8" height="6" rx="1" fill="#5dffc0" opacity="0.6" />
          <rect x="18" y="6" width="12" height="16" rx="1" fill="#1a202c" />
          {isGenerating && (
            <circle cx="30" cy="4" r="3" fill="#5dffc0" className="knox-pulse-dot" />
          )}
        </g>

        {/* Ground shadow */}
        <ellipse cx="180" cy="248" rx="100" ry="12" fill="#000" opacity="0.25" />
      </svg>

      <p className="mt-1 text-center text-xs font-medium text-[#5dffc0]">
        {t("inverterStatus")}: {isGenerating ? t("statusGenerating") : t("statusStandby")}
      </p>
    </div>
  );
}
