import React from 'react';

interface PaldoLogoProps {
  className?: string;
  /** Lime accent used for the tallest bar + flow arc. */
  accent?: string;
  /** Bar color for the two shorter bars. */
  bars?: string;
}

/**
 * FINOVA mark — abstract growth + flow, no literal money imagery.
 * Three ascending rounded bars (momentum) over a rising pathway arc.
 * Reads at 16px favicon through hero sizes; works on light and dark.
 */
export const PaldoLogo: React.FC<PaldoLogoProps> = ({
  className = 'h-6 w-6',
  accent = '#c4f042',
  bars = 'white',
}) => {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {/* Rising pathway — flow / financial direction */}
      <path
        d="M14 84 Q50 68 86 80"
        fill="none"
        stroke={accent}
        strokeWidth="6"
        strokeLinecap="round"
        opacity="0.85"
      />
      {/* Ascending bars — growth */}
      <rect x="24" y="56" width="15" height="22" rx="7" fill={bars} />
      <rect x="43.5" y="40" width="15" height="38" rx="7" fill={bars} />
      <rect x="63" y="22" width="15" height="56" rx="7" fill={accent} />
    </svg>
  );
};
