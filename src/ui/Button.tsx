"use client";

import { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerGhost" | "soft";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-primary text-on-primary hover:bg-primary-container shadow-sm disabled:bg-primary/40 disabled:shadow-none",
  secondary:
    "bg-surface-card text-on-surface border border-border-subtle hover:bg-surface-slate shadow-xs disabled:text-outline",
  soft: "bg-surface-container-low text-primary hover:bg-surface-container disabled:text-outline",
  ghost: "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low disabled:text-outline-variant",
  danger: "bg-error text-on-error hover:bg-on-error-container shadow-sm disabled:bg-error/40",
  dangerGhost: "text-error hover:bg-error-container/60 disabled:text-outline-variant",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-2.5 gap-1.5 text-label-md font-label-md rounded-lg",
  md: "h-10 px-3.5 gap-2 text-label-lg font-label-lg rounded-lg",
  lg: "h-12 px-5 gap-2 text-label-lg font-label-lg rounded-xl",
};

const ICON_SIZE: Record<Size, number> = { sm: 15, md: 17, lg: 18 };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  /** square icon-only button; `children` becomes the accessible label */
  iconOnly?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, iconRight: IconRight, iconOnly, className = "", children, type, ...rest },
  ref
) {
  const square = iconOnly ? { sm: "w-8 px-0", md: "w-10 px-0", lg: "w-12 px-0" }[size] : "";
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={`inline-flex items-center justify-center whitespace-nowrap select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1 disabled:cursor-not-allowed ${VARIANT[variant]} ${SIZE[size]} ${square} ${className}`}
      aria-label={iconOnly && typeof children === "string" ? children : rest["aria-label"]}
      title={iconOnly && typeof children === "string" ? children : rest.title}
      {...rest}
    >
      {Icon && <Icon size={ICON_SIZE[size]} strokeWidth={2} aria-hidden className="shrink-0" />}
      {!iconOnly && children}
      {IconRight && <IconRight size={ICON_SIZE[size]} strokeWidth={2} aria-hidden className="shrink-0" />}
    </button>
  );
});
