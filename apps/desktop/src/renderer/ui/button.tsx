/* Adapted from storylens dashboard; copyright 2026 Hussain Abbas. AGPL-3.0-or-later. */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Spinner } from "./spinner.tsx";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  loading = false,
  icon,
  iconOnly = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  icon?: ReactNode;
  /** Icon-only buttons still need an `aria-label`. */
  iconOnly?: boolean;
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${iconOnly ? "btn-icon" : ""} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {/* The span keeps the label a stable element: page translators swap
			    bare text nodes, and React then fails to insert the spinner before it. */}
      {children != null && children !== false && <span>{children}</span>}
    </button>
  );
}
