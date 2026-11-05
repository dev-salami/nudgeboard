import { formatUsd } from "@/lib/money";

export function Money({ value, prefix = "$", className = "" }: { value: number | string; prefix?: string; className?: string }) {
  const text = formatUsd(value);
  const [whole, decimals] = text.split(".");
  return (
    <span className={className}>
      {prefix}
      {whole}
      {decimals !== undefined ? <span className="dec">.{decimals}</span> : null}
    </span>
  );
}

export function Delta({ tone, children }: { tone: "up" | "down" | "flat"; children: React.ReactNode }) {
  return (
    <span className={`delta ${tone}`}>
      {tone === "up" ? "↑" : tone === "down" ? "↓" : "•"} {children}
    </span>
  );
}

export function ArcGauge({ ratio }: { ratio: number }) {
  const r = 90;
  const length = Math.PI * r;
  const filled = Math.max(0, Math.min(1, ratio)) * length;
  return (
    <svg viewBox="0 0 220 120" className="gauge" aria-hidden>
      <path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="#3a404d" strokeWidth="6" strokeLinecap="round" strokeDasharray="2 5" />
      <path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="#71FC8F" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${filled} ${length}`} />
    </svg>
  );
}

export interface Bar {
  value: number;
  on: boolean;
  label?: { top: string; sub: string };
}

export function BarStrip({ bars, height = 150 }: { bars: Bar[]; height?: number }) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <div className="relative" style={{ height: height + 36 }}>
      <div className="bars absolute inset-x-0 bottom-0" style={{ height }}>
        {bars.map((bar, index) => (
          <i key={index} className={bar.on ? "on" : ""} style={{ height: `${Math.max(6, (bar.value / max) * 100)}%` }} />
        ))}
      </div>
    </div>
  );
}

export function MarbleMark() {
  return (
    <svg className="marble" viewBox="0 0 460 420" role="img" aria-label="A silver marble coin">
      <defs>
        <radialGradient id="silver" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="42%" stopColor="#d7dbe2" />
          <stop offset="100%" stopColor="#8d939e" />
        </radialGradient>
        <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f7f7f8" />
          <stop offset="50%" stopColor="#b7bdc7" />
          <stop offset="100%" stopColor="#6e7582" />
        </linearGradient>
      </defs>
      <ellipse cx="230" cy="360" rx="120" ry="18" fill="#181C25" opacity="0.08" />
      <circle cx="230" cy="196" r="148" fill="none" stroke="url(#ring)" strokeWidth="18" />
      <circle cx="230" cy="196" r="112" fill="url(#silver)" />
      <circle cx="198" cy="160" r="36" fill="#ffffff" opacity="0.55" />
      <path d="M168 210c28-6 40-48 74-48 22 0 28 20 48 20 26 0 36-30 58-30" fill="none" stroke="#181C25" strokeWidth="8" strokeLinecap="round" opacity="0.8" />
      <circle cx="332" cy="92" r="16" fill="#71FC8F" />
    </svg>
  );
}
