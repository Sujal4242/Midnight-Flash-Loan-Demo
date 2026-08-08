/**
 * Dependency-free inline SVG icon set (stroke style, 24×24 viewBox).
 * Every icon inherits `currentColor` so it tints with its context.
 */

import type { ReactNode } from 'react';

export interface IconProps {
  className?: string;
  size?: number;
}

function Svg({ children, className, size = 16 }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function Bolt(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z" />
    </Svg>
  );
}

export function Wallet(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M16 10h5v4h-5a2 2 0 0 1 0-4z" />
    </Svg>
  );
}

export function ShieldCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

export function Activity(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 12h4l3 8 4-16 3 8h4" />
    </Svg>
  );
}

export function Check(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </Svg>
  );
}

export function AlertTriangle(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4 2.5 20h19L12 4z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </Svg>
  );
}

export function Lock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function ArrowDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v16" />
      <path d="M6 14l6 6 6-6" />
    </Svg>
  );
}

export function ChevronDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 9l6 6 6-6" />
    </Svg>
  );
}

export function RefreshCw(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12a9 9 0 1 1-2.64-6.36" />
      <path d="M21 3v5h-5" />
    </Svg>
  );
}

export function Plus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Svg>
  );
}

export function TrendingUp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </Svg>
  );
}

export function ExternalLink(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4h6v6" />
      <path d="M10 14 20 4" />
      <path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4" />
    </Svg>
  );
}
