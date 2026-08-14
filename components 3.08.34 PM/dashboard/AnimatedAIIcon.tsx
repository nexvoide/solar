export default function AnimatedAIIcon({ tone = "violet", label = "AI powered" }: { tone?: "violet" | "emerald" | "sky"; label?: string }) {
  return <span className={`ai-feature-icon ai-feature-icon-${tone}`} role="img" aria-label={label}>
    <span className="ai-feature-ring" aria-hidden="true" />
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M12.4 8.1a4.2 4.2 0 0 0-6.1 3.7 4.4 4.4 0 0 0 1.1 8.5 4.7 4.7 0 0 0 5 4.5M19.6 8.1a4.2 4.2 0 0 1 6.1 3.7 4.4 4.4 0 0 1-1.1 8.5 4.7 4.7 0 0 1-5 4.5M12.4 7.3v17.9M19.6 7.3v17.9M12.4 12.2H9.6M19.6 12.2h2.8M12.4 19.8H9.7M19.6 19.8h2.7M12.4 16h7.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="16" r="1.7" fill="currentColor" />
    </svg>
    <span className="ai-feature-spark ai-feature-spark-one" aria-hidden="true">✦</span>
    <span className="ai-feature-spark ai-feature-spark-two" aria-hidden="true">·</span>
  </span>;
}
