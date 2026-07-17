/**
 * BearBoard brand mark (inline SVG so it's crisp at any size, no asset fetch).
 * Same artwork as assets/brand/bearboard-mark.svg — keep in sync.
 */
export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect width="1024" height="1024" rx="180" fill="#BA0C2F" />
      <rect x="422" y="150" width="180" height="120" rx="28" fill="#FFFFFF" />
      <circle cx="512" cy="196" r="20" fill="#BA0C2F" />
      <rect x="242" y="212" width="540" height="640" rx="56" fill="#FFFFFF" />
      <circle cx="412" cy="344" r="56" fill="#BA0C2F" />
      <circle cx="612" cy="344" r="56" fill="#BA0C2F" />
      <path
        d="M512 330 C 610 330 672 396 672 480 C 672 570 596 624 512 662 C 428 624 352 570 352 480 C 352 396 414 330 512 330 Z"
        fill="#BA0C2F"
      />
      <rect
        x="424"
        y="450"
        width="78"
        height="22"
        rx="11"
        transform="rotate(14 463 461)"
        fill="#FFFFFF"
      />
      <rect
        x="522"
        y="450"
        width="78"
        height="22"
        rx="11"
        transform="rotate(-14 561 461)"
        fill="#FFFFFF"
      />
      <ellipse cx="512" cy="560" rx="62" ry="46" fill="#FFFFFF" />
      <ellipse cx="512" cy="542" rx="23" ry="15" fill="#BA0C2F" />
      <path
        d="M512 556 v12 M512 568 q-16 15 -32 4 M512 568 q16 15 32 4"
        stroke="#BA0C2F"
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="322" y="716" width="180" height="22" rx="11" fill="#BA0C2F" />
      <rect x="296" y="762" width="150" height="22" rx="11" fill="#BA0C2F" />
      <rect x="322" y="808" width="110" height="22" rx="11" fill="#BA0C2F" />
      <circle cx="676" cy="668" r="30" fill="#BA0C2F" />
      <g stroke="#BA0C2F" strokeWidth="32" strokeLinecap="round" fill="none">
        <path d="M660 708 L620 776" />
        <path d="M656 716 L714 740 L758 722" />
        <path d="M658 722 L600 736 L562 714" />
        <path d="M620 776 L678 812 L690 864" />
        <path d="M620 776 L566 824 L508 832" />
      </g>
    </svg>
  );
}

/** Mark + wordmark lockup for headers. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span
        className="font-extrabold tracking-tight text-brand-crimson"
        style={{ fontSize: size * 0.62 }}
      >
        BearBoard
      </span>
    </span>
  );
}
