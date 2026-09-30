"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type RevealVariant = "up" | "fade" | "scale" | "blur";

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Stagger offset in ms, applied as a CSS transition delay. */
  delay?: number;
  variant?: RevealVariant;
  /** Fraction of the element that must be visible before revealing. */
  threshold?: number;
};

/**
 * Dependency-free, reduced-motion-aware scroll reveal.
 *
 * The animation itself lives in CSS (`.reveal`); this only decides *when* to
 * add the visible class, so the work stays on the compositor and no animation
 * library is needed. Visitors who prefer reduced motion never get the hidden
 * start state — CSS forces the final state and this bails out early.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  variant = "up",
  threshold = 0.12,
}: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // No observer for reduced motion: the stylesheet already forces the
    // final state, so there is nothing to animate and no state to set.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setIsVisible(true);
        observer.unobserve(entry.target);
      },
      { threshold, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [threshold]);

  return (
    <div
      ref={ref}
      data-variant={variant}
      className={`reveal ${isVisible ? "reveal--visible" : ""} ${className}`}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
