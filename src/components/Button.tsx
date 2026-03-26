"use client";

import { forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "default";
type ButtonSize = "sm" | "md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: "ct-btn ct-btn-primary",
  secondary: "ct-btn ct-btn-secondary",
  danger: "ct-btn bg-ct-strike text-white",
  default: "ct-btn",
  ghost: "font-ui text-ct-muted hover:text-ct-ink transition-colors",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "text-xs",
  md: "",
};

/**
 * Polymorphic button with variant-driven styling.
 *
 * Variants map to the existing ct-btn CSS classes in globals.css:
 * - "primary"   → accent background, white text
 * - "secondary"  → cream background, hairline border
 * - "danger"     → strike-red background, white text
 * - "default"    → base ct-btn (cream bg, no accent)
 * - "ghost"      → text-only, muted → ink on hover
 *
 * forwardRef so parent components can attach refs if needed
 * (e.g., for focus management in modals).
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = "default", size = "md", className = "", children, ...props }, ref) {
    const classes = [
      variantClasses[variant],
      sizeClasses[size],
      className,
    ].filter(Boolean).join(" ");

    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    );
  }
);
