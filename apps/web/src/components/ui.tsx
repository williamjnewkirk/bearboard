'use client';

/**
 * Small UI kit for the coach console. Brand colors carry weight only where it
 * matters (primary actions, headers, semantic emphasis); neutrals stay gray.
 */
import type { ReactNode } from 'react';
import { PawPrint } from 'lucide-react';

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      {title || action ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? (
            <h2 className="text-base font-semibold text-brand-forest">{title}</h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  small,
  type = 'button',
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  disabled?: boolean;
  small?: boolean;
  type?: 'button' | 'submit';
  title?: string;
}) {
  const base = `inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
    small ? 'px-2.5 py-1 text-xs' : 'px-4 py-2 text-sm'
  }`;
  const variants: Record<string, string> = {
    primary: 'bg-brand-maroon text-white hover:bg-brand-maroon/90',
    secondary: 'bg-brand-green text-white hover:bg-brand-green/90',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
    danger: 'border border-brand-crimson/40 text-brand-crimson hover:bg-brand-crimson/5',
    ghost: 'text-gray-500 hover:text-gray-800 hover:bg-gray-100',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${variants[variant] ?? variants.primary}`}
    >
      {children}
    </button>
  );
}

export function Badge({
  children,
  color = '#6B7280',
  className = '',
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={{ color, backgroundColor: `${color}1A` }}
    >
      {children}
    </span>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="mb-3 rounded-lg border border-brand-crimson/30 bg-brand-crimson/5 p-3 text-sm text-brand-crimson">
      {children}
    </div>
  );
}

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50/50 p-10 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-full bg-brand-maroon/10 text-brand-maroon">
        {icon ?? <PawPrint size={22} />}
      </div>
      <p className="font-semibold text-gray-800">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-gray-500">{hint}</p> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loaders — perceived-performance placeholders that match the shape
// of the content they stand in for (Tailwind's animate-pulse).
// ---------------------------------------------------------------------------

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-200/80 ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
          <div className="flex gap-4 pt-1">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FeedSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            {Array.from({ length: cols - 1 }).map((_, c) => (
              <Skeleton key={c} className="h-3.5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center p-8">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-maroon border-t-transparent" />
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className={`max-h-[88vh] w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-y-auto rounded-xl bg-white p-5 shadow-xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-brand-forest">{title}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const inputCls =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-maroon focus:outline-none focus:ring-1 focus:ring-brand-maroon/30';
export const selectCls =
  'rounded-lg border border-gray-300 px-2 py-2 text-sm focus:border-brand-maroon focus:outline-none';
export const labelCls = 'mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

/** Initials avatar (photo when available). */
export function Avatar({
  name,
  photoUrl,
  size = 32,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
}) {
  if (photoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const initials = name
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-brand-forest/10 font-semibold text-brand-forest"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || '?'}
    </span>
  );
}
