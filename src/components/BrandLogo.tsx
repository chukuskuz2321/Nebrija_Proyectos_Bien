import React from 'react';

interface BrandLogoProps {
  size?: number;
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 28, className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 512 512"
    width={size}
    height={size}
    className={`shrink-0 ${className}`}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="pnBgGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#14141D" />
        <stop offset="100%" stopColor="#09090B" />
      </linearGradient>
      <linearGradient id="pnBlueAccent" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#60A5FA" />
        <stop offset="100%" stopColor="#2563EB" />
      </linearGradient>
      <linearGradient id="pnWhiteStroke" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#D4D4E0" />
      </linearGradient>
    </defs>
    <rect
      x="16"
      y="16"
      width="480"
      height="480"
      rx="108"
      fill="url(#pnBgGrad)"
      stroke="#2A2A38"
      strokeWidth="14"
    />
    <line x1="16" y1="176" x2="496" y2="176" stroke="#1E1E2A" strokeWidth="5" />
    <line x1="336" y1="16" x2="336" y2="496" stroke="#1E1E2A" strokeWidth="5" />
    <path
      d="M128 384V128H188L312 308V128H372V384H312L188 204V384H128Z"
      fill="url(#pnWhiteStroke)"
    />
    <path d="M188 128L312 308V384L188 204V128Z" fill="url(#pnBlueAccent)" />
    <rect x="364" y="84" width="60" height="60" rx="14" fill="#3B82F6" />
    <rect x="380" y="100" width="28" height="28" rx="6" fill="#09090B" />
    <rect x="388" y="108" width="12" height="12" rx="3" fill="#93C5FD" />
  </svg>
);
