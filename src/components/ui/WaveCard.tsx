import React from 'react';

interface WaveCardProps {
  title?: string;
  subtitle?: string;
  statusDot?: boolean;
  amount: string;
  currencySymbol?: string;
  trendText?: string;
  trendDirection?: 'up' | 'down' | 'neutral';
  metaText?: string;
  rightBadge?: React.ReactNode;
  className?: string;
}

export const WaveCard: React.FC<WaveCardProps> = ({
  title,
  subtitle,
  statusDot = false,
  amount,
  currencySymbol = '₱',
  trendText,
  trendDirection = 'neutral',
  metaText,
  rightBadge,
  className = '',
}) => {
  return (
    <div
      className={`relative overflow-hidden rounded-[28px] sm:rounded-[32px] bg-[#153424] p-5 sm:p-6 text-white shadow-lg shadow-emerald-950/20 w-full transition-all ${className}`}
    >
      {/* Decorative Wave Contour Lines */}
      <svg
        className="pointer-events-none absolute right-0 top-0 h-full w-full opacity-40"
        viewBox="0 0 380 180"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <path
          d="M60 40 C140 10, 220 90, 320 50 C360 35, 390 60, 420 80"
          stroke="#4ADE80"
          strokeWidth="1.2"
          strokeOpacity="0.4"
        />
        <path
          d="M40 70 C130 40, 210 120, 310 80 C360 60, 390 90, 430 110"
          stroke="#86EFAC"
          strokeWidth="1.2"
          strokeOpacity="0.35"
        />
        <path
          d="M20 100 C110 70, 200 150, 300 110 C350 90, 390 120, 440 140"
          stroke="#A7F3D0"
          strokeWidth="1"
          strokeOpacity="0.25"
        />
        <path
          d="M0 130 C100 100, 190 180, 290 140 C340 120, 390 150, 450 170"
          stroke="#D4F63D"
          strokeWidth="0.9"
          strokeOpacity="0.3"
        />
      </svg>

      {/* Card Header Row */}
      <div className="relative z-10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {subtitle && (
            <span className="text-xs sm:text-sm font-medium text-emerald-200/85 tracking-wide">
              {subtitle}
            </span>
          )}
        </div>

        {rightBadge ? (
          rightBadge
        ) : statusDot ? (
          <div className="relative flex h-3.5 w-3.5 items-center justify-center">
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#D4F63D] shadow-[0_0_8px_#D4F63D]"></span>
          </div>
        ) : null}
      </div>

      {/* Main Large Financial Amount */}
      <div className="relative z-10 mt-2.5 mb-3.5 money">
        <div className="flex items-baseline gap-1.5 sm:gap-2">
          <span className="text-2xl sm:text-3xl font-bold text-[#86EFAC] tracking-tight">
            {currencySymbol}
          </span>
          <span className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-white">
            {amount}
          </span>
        </div>
        {title && <p className="mt-0.5 text-xs sm:text-sm text-emerald-200/70 font-medium">{title}</p>}
      </div>

      {/* Stats Footer Row */}
      {(trendText || metaText) && (
        <div className="relative z-10 flex flex-wrap items-center gap-2 text-xs sm:text-sm font-medium text-emerald-100/90 pt-2 border-t border-emerald-800/50">
          {trendText && (
            <span
              className={`inline-flex items-center gap-1 font-bold ${
                trendDirection === 'up'
                  ? 'text-[#D4F63D]'
                  : trendDirection === 'down'
                  ? 'text-[#86EFAC]'
                  : 'text-emerald-200'
              }`}
            >
              {trendDirection === 'up' && '↑'}
              {trendDirection === 'down' && '↓'}
              {trendText}
            </span>
          )}
          {trendText && metaText && (
            <span className="text-emerald-700 font-normal">|</span>
          )}
          {metaText && <span className="text-emerald-200/80 font-normal">{metaText}</span>}
        </div>
      )}
    </div>
  );
};
