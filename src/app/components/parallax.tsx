"use client";

import { useEffect, useRef, type ReactNode } from "react";

type ParallaxProps = {
  children: ReactNode;
  className?: string;
  /** Fraction of scroll distance to offset by. Keep it small and subtle. */
  speed?: number;
};

/**
 * Subtle scroll parallax.
 *
 * Writes only `transform`, batches through requestAnimationFrame, listens
 * passively, and stays idle while the element is off-screen — so it costs
 * nothing on the rest of the page. Disabled entirely for reduced motion.
 */
export function Parallax({
  children,
  className = "",
  speed = 0.15,
}: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let onScreen = false;

    const paint = () => {
      frame = 0;
      const { top } = element.getBoundingClientRect();
      element.style.transform = `translate3d(0, ${(top * -speed).toFixed(2)}px, 0)`;
    };

    const schedule = () => {
      if (!onScreen || frame) return;
      frame = requestAnimationFrame(paint);
    };

    const observer = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      schedule();
    });

    observer.observe(element);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    paint();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
      element.style.transform = "";
    };
  }, [speed]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
