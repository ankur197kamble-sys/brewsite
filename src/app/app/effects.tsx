"use client";

import { useEffect } from "react";

/** Everything that gets a glow ripple when tapped. */
const RIPPLE = ".app-btn, .app-chip, .app-stepper button, .app-tab";

/**
 * One listener for the whole app: when a button is pressed, start a soft
 * glow ripple from the point that was touched (drawn by CSS, see
 * [data-rippling] in globals.css). Purely decorative. A data attribute, not
 * a class, because React rewrites className when a tab becomes active.
 */
export function AppEffects() {
  useEffect(() => {
    function onDown(event: PointerEvent) {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>(RIPPLE) : null;
      if (!target || target.matches(":disabled")) return;
      const box = target.getBoundingClientRect();
      target.style.setProperty("--rx", `${event.clientX - box.left}px`);
      target.style.setProperty("--ry", `${event.clientY - box.top}px`);
      // Big enough to cover the whole button from any starting point.
      target.style.setProperty("--rs", String((Math.max(box.width, box.height) / 12) * 2.6));
      delete target.dataset.rippling;
      void target.offsetWidth; // restart the animation on a quick second tap
      target.dataset.rippling = "";
    }

    function onEnd(event: AnimationEvent) {
      if (event.target instanceof HTMLElement && event.animationName.startsWith("app-ripple")) {
        delete event.target.dataset.rippling;
      }
    }

    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("animationend", onEnd);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("animationend", onEnd);
    };
  }, []);

  return null;
}
