"use client";
// ============================================================
// STIKAR ESPORTS — Komponen dasar neobrutalism
// ============================================================

import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function BoCard({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bo-card", className)} {...props}>
      {children}
    </div>
  );
}

export function BoCardLg({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bo-card-lg", className)} {...props}>
      {children}
    </div>
  );
}

type BoButtonVariant =
  | "primary"
  | "fire"
  | "yellow"
  | "gold"
  | "cyan"
  | "purple"
  | "flame"
  | "white"
  | "black"
  | "destructive"
  | "danger";

interface BoButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BoButtonVariant;
}

const variantClass: Record<BoButtonVariant, string> = {
  primary: "bo-btn-primary",
  fire: "bo-btn-primary",
  yellow: "bo-btn-yellow",
  gold: "bo-btn-yellow",
  cyan: "bo-btn-cyan",
  purple: "bo-btn-purple",
  flame: "bo-btn-purple",
  white: "bo-btn-white",
  black: "bo-btn-black",
  destructive: "bo-btn-danger",
  danger: "bo-btn-danger",
};

export const BoButton = forwardRef<HTMLButtonElement, BoButtonProps>(
  function BoButton({ className, variant = "primary", ...props }, ref) {
    return (
      <button
        ref={ref}
        className={cn("bo-btn", variantClass[variant], className)}
        {...props}
      />
    );
  },
);

export function BoBadge({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("bo-badge bg-fs-panel text-fs-text", className)} {...props}>
      {children}
    </span>
  );
}

export function SectionTitle({
  kicker,
  title,
  className,
}: {
  kicker?: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-6", className)}>
      {kicker ? (
        <span className="bo-kicker mb-2 inline-block bg-zb-purple">{kicker}</span>
      ) : null}
      <h2 className="bo-title">{title}</h2>
    </div>
  );
}
