// Inline SVG icon set. Stroke-based, 24x24 viewBox, currentColor.
// Kept dependency-free and consistent with the design system.

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...props }: IconProps, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconShield = (p: IconProps) =>
  base(p, (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6l7-3z" />
      <path d="M9 12l2 2 4-4.5" />
    </>
  ));

export const IconLock = (p: IconProps) =>
  base(p, (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ));

export const IconKey = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="8" cy="8" r="4" />
      <path d="M10.8 10.8L20 20" />
      <path d="M16 16l2 2" />
    </>
  ));

export const IconCertificate = (p: IconProps) =>
  base(p, (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
      <circle cx="15" cy="16" r="2.4" />
    </>
  ));

export const IconFingerprint = (p: IconProps) =>
  base(p, (
    <>
      <path d="M6.5 12a5.5 5.5 0 0 1 11 0" />
      <path d="M4 12a8 8 0 0 1 16 0" />
      <path d="M8.5 12a3.5 3.5 0 0 1 7 0c0 2.5.5 5-1 7" />
      <path d="M9 12c0 4-1 6-2 8M13 12c0 3 .3 5 .6 8" />
    </>
  ));

export const IconIdCard = (p: IconProps) =>
  base(p, (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10.5" r="2" />
      <path d="M6 15c.4-1.6 1.5-2.4 2.5-2.4S10.6 13.4 11 15" />
      <path d="M14 9.5h4M14 12.5h4M14 15.5h2" />
    </>
  ));

export const IconEye = (p: IconProps) =>
  base(p, (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ));

export const IconEyeOff = (p: IconProps) =>
  base(p, (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A9.5 9.5 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.2 2.9M6.5 7.2C4 8.8 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.6 4.2-1.4" />
      <path d="M10 10.5a2 2 0 0 0 2.8 2.8" />
    </>
  ));

export const IconChip = (p: IconProps) =>
  base(p, (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
      <path d="M10 10h4v4h-4z" />
    </>
  ));

export const IconNetwork = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <path d="M12 7c-1.5 3-3.2 6-5.6 9M12 7c1.5 3 3.2 6 5.6 9M7 16l1.4 1M17 16l-1.4 1" />
    </>
  ));

export const IconLedger = (p: IconProps) =>
  base(p, (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M3 15h18M9 9v10" />
    </>
  ));

export const IconClock = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ));

export const IconCheck = (p: IconProps) =>
  base(p, <path d="M4.5 12.5l5 5 10-11" />);

export const IconCheckCircle = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.8 2.8L16.5 9" />
    </>
  ));

export const IconX = (p: IconProps) =>
  base(p, <path d="M6 6l12 12M18 6L6 18" />);

export const IconAlert = (p: IconProps) =>
  base(p, (
    <>
      <path d="M12 3L2.5 20h19L12 3z" />
      <path d="M12 9.5V14" />
      <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
    </>
  ));

export const IconInfo = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8.5v.01M12 11v5" />
    </>
  ));

export const IconArrowDown = (p: IconProps) =>
  base(p, <path d="M12 4v16m0 0l-6-6m6 6l6-6" />);

export const IconArrowRight = (p: IconProps) =>
  base(p, <path d="M4 12h16m0 0l-6-6m6 6l-6 6" />);

export const IconRefresh = (p: IconProps) =>
  base(p, (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 3v4h-4" />
    </>
  ));

export const IconCopy = (p: IconProps) =>
  base(p, (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ));

export const IconExternal = (p: IconProps) =>
  base(p, (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </>
  ));

export const IconWallet = (p: IconProps) =>
  base(p, (
    <>
      <rect x="3" y="6" width="18" height="14" rx="2.5" />
      <path d="M3 9.5h18" />
      <circle cx="16.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ));

export const IconSettings = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" />
    </>
  ));

export const IconShieldCheck = (p: IconProps) =>
  base(p, (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6l7-3z" />
      <path d="M9 11.5l2.2 2.2L15.5 9" />
    </>
  ));

export const IconShieldLock = (p: IconProps) =>
  base(p, (
    <>
      <path d="M12 3l7 3v5c0 4.5-3 8.2-7 9.5C8 19.2 5 15.5 5 11V6l7-3z" />
      <rect x="9.5" y="11" width="5" height="4" rx="1" />
      <path d="M10.5 11V9.5a1.5 1.5 0 0 1 3 0V11" />
    </>
  ));

export const IconUser = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1-4 3.5-6 7-6s6 2 7 6" />
    </>
  ));

export const IconUsers = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c.8-3.2 3-5 6-5s5.2 1.8 6 5" />
      <path d="M15.5 5.5a3 3 0 0 1 0 5M17.5 14.5c1.6.6 2.7 2 3 4" />
    </>
  ));

export const IconBuilding = (p: IconProps) =>
  base(p, (
    <>
      <rect x="4" y="3" width="12" height="18" rx="1" />
      <path d="M16 9h4v12" />
      <path d="M7.5 7h1.5M10.5 7h1.5M7.5 11h1.5M10.5 11h1.5M7.5 15h1.5M10.5 15h1.5M8 21v-3h4v3" />
    </>
  ));

export const IconGavel = (p: IconProps) =>
  base(p, (
    <>
      <path d="M14 4l6 6-3 3-6-6 3-3z" />
      <path d="M9 9l6 6" />
      <path d="M5 13l3 3-3 3-3-3 3-3z" />
      <path d="M21 20H9" />
    </>
  ));

export const IconActivity = (p: IconProps) =>
  base(p, (
    <>
      <path d="M3 12h4l2.5-7 4 14 2.5-7h5" />
    </>
  ));

export const IconZap = (p: IconProps) =>
  base(p, <path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12L13 2z" />);

export const IconMenu = (p: IconProps) =>
  base(p, <path d="M4 6h16M4 12h16M4 18h16" />);

export const IconChevronDown = (p: IconProps) =>
  base(p, <path d="M6 9l6 6 6-6" />);

export const IconChevronRight = (p: IconProps) =>
  base(p, <path d="M9 6l6 6-6 6" />);

export const IconChevronUp = (p: IconProps) =>
  base(p, <path d="M6 15l6-6 6 6" />);

export const IconBook = (p: IconProps) =>
  base(p, (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2V5z" />
      <path d="M4 19a2 2 0 0 1 2-2h14" />
    </>
  ));

export const IconCode = (p: IconProps) =>
  base(p, (
    <>
      <path d="M8 8L4 12l4 4M16 8l4 4-4 4M13 5l-2 14" />
    </>
  ));

export const IconDot = (p: IconProps) =>
  base(p, <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />);

export const IconGlobe = (p: IconProps) =>
  base(p, (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.3 3.8 5.2 3.8 8.5s-1.3 6.2-3.8 8.5c-2.5-2.3-3.8-5.2-3.8-8.5S9.5 5.8 12 3.5z" />
    </>
  ));

export const IconLogout = (p: IconProps) =>
  base(p, (
    <>
      <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3" />
      <path d="M16 8l4 4-4 4" />
      <path d="M20 12H9" />
    </>
  ));

export const IconScale = (p: IconProps) =>
  base(p, (
    <>
      <path d="M12 4v16M6 8h12" />
      <path d="M6 8l-3 6a3 3 0 0 0 6 0L6 8z" />
      <path d="M18 8l-3 6a3 3 0 0 0 6 0l-3-6z" />
      <path d="M5 20h14" />
    </>
  ));
