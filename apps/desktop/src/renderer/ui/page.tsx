/* Adapted from storylens dashboard; copyright 2026 Hussain Abbas. AGPL-3.0-or-later. */
import { CircleAlert, Inbox, ShieldOff } from "lucide-react";
import type { ReactNode } from "react";

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Please try again.";

import { Button } from "./button.tsx";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
        <Inbox size={20} strokeWidth={1.75} aria-hidden />
      </span>
      <p className="font-semibold">{title}</p>
      {children && (
        <div className="mt-1 max-w-sm text-sm text-muted">{children}</div>
      )}
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center px-6 py-14 text-center"
    >
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--error)_12%,transparent)] text-danger">
        <CircleAlert size={20} strokeWidth={1.75} aria-hidden />
      </span>
      <p className="font-semibold">Couldn’t load this data</p>
      <p className="mt-1 max-w-sm text-sm text-muted">{errorMessage(error)}</p>
      {onRetry && (
        <Button className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Forbidden() {
  return (
    <div className="card flex flex-col items-center px-6 py-16 text-center">
      <span className="mb-3 grid size-11 place-items-center rounded-full bg-wash text-muted">
        <ShieldOff size={20} strokeWidth={1.75} aria-hidden />
      </span>
      <h1 className="text-lg font-semibold">
        You don’t have access to this page
      </h1>
      <p className="mt-1 max-w-sm text-sm text-muted">
        Your role doesn’t include the permission this page needs. Ask a super
        admin to update your role.
      </p>
    </div>
  );
}

/** Placeholder rows that keep the table height while data loads. */
export function TableSkeleton({
  rows = 6,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  const rowIds = Array.from({ length: rows }, (_, index) => `row-${index}`);
  const columnIds = Array.from(
    { length: columns },
    (_, index) => `column-${index}`,
  );
  return (
    <div aria-busy="true" className="divide-y divide-line">
      <span className="sr-only">Loading</span>
      {rowIds.map((rowId) => (
        <div key={rowId} className="flex gap-6 px-4 py-4">
          {columnIds.map((columnId) => (
            <span
              key={columnId}
              className="h-3.5 flex-1 animate-pulse rounded bg-wash motion-reduce:animate-none"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
