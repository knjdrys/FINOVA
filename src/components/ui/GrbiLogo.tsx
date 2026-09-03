import React from 'react';

interface GrbiLogoProps {
  className?: string;
  size?: number;
}

export const GrbiLogo: React.FC<GrbiLogoProps> = ({ className = 'h-6 w-6', size = 24 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 115"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Deep Navy Blue Background Container */}
      <rect width="100" height="115" rx="16" fill="#1C205E" />

      {/* Vibrant Green Outer Circle Ring */}
      <circle cx="50" cy="57" r="42" stroke="#05A34E" strokeWidth="8" />

      {/* Gold Stylized Triangular 'G' */}
      <path
        d="M50 20 L80 68 L60 68 L50 48 L40 68 L20 68 Z"
        fill="#C3984E"
      />
      <path
        d="M38 46 L70 46 L70 54 L48 54 L48 68 L78 68 L82 74 L18 74 L50 20 Z"
        fill="#C3984E"
      />

      {/* Stylized Golden G Shape */}
      <path
        d="M50 22 C52 22 79 66 79 68 C79 70 76 72 72 72 L28 72 C24 72 21 70 21 68 L48 24 C49 22 50 22 50 22 Z"
        fill="#C59B4D"
      />
      {/* Inner Cutout to form the G loop */}
      <path
        d="M50 36 L66 62 L48 62 L48 54 L60 54 L50 36 Z"
        fill="#1C205E"
      />
      {/* G Crossbar and Rising Sun Accent */}
      <path
        d="M45 54 L68 54 L68 62 L45 62 Z"
        fill="#C59B4D"
      />
      <path
        d="M36 56 C38 52 44 52 46 56 L48 62 L34 62 Z"
        fill="#FACC15"
      />
      <path
        d="M41 51 L43 47 L45 51 Z"
        fill="#FACC15"
      />
      <path
        d="M46 52 L49 49 L48 53 Z"
        fill="#FACC15"
      />
      <path
        d="M36 53 L33 50 L38 52 Z"
        fill="#FACC15"
      />
    </svg>
  );
};
