"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Greeting } from "@/app/lib/greeting";
import { scriptFont } from "./script-font";
import { INTRO_COOKIE } from "./intro-settings";

/** Remembers for this visit that the intro has been seen. */
export function markIntroSeen() {
  document.cookie = `${INTRO_COOKIE}=1; path=/; SameSite=Lax`;
}

/**
 * When the intro is over (its fade-out ends at 5.25s, or 2.85s with reduced
 * motion) plus a margin for the page underneath to finish coming in. Timed
 * from page load, so it also holds if the page hydrated late.
 */
const INTRO_END_MS = 6000;
const INTRO_END_REDUCED_MS = 3300;
/** A skip fades the intro out in 320ms (see .app-intro--leaving). */
const SKIP_FADE_MS = 400;

const BEANS = Array.from({ length: 12 }, (_, index) => index * 30);

/** Leaves around the edges: position and angle, all pointing into the screen. */
const LEAVES: { x: number; y: number; angle: number; delay: number }[] = [
  { x: -18, y: 110, angle: 28, delay: 0.25 },
  { x: 408, y: 170, angle: 152, delay: 0.35 },
  { x: -26, y: 470, angle: -8, delay: 0.45 },
  { x: 416, y: 540, angle: 188, delay: 0.3 },
  { x: 6, y: 780, angle: -38, delay: 0.4 },
  { x: 384, y: 812, angle: 218, delay: 0.5 },
];

/**
 * The opening moment, once per visit: the app icon's emblem grows out of the
 * splash screen, a sunset rises, coffee leaves sweep in and away, then the
 * café's name writes in and the greeting appears. All CSS and vector art
 * (see .app-intro in globals.css), rendered by the server so it is there
 * from the first frame. A tap or any key skips it; screen readers skip it
 * entirely and go straight to the page, which shows the same greeting.
 *
 * When it is over it removes itself and releases the page's entry delay, so
 * later screens (the layout stays mounted across them) appear at once.
 */
export function AppIntro({ name, greeting }: { name: string; greeting: Greeting }) {
  const root = useRef<HTMLDivElement>(null);
  const [done, setDone] = useState(false);

  const finish = useCallback(() => {
    root.current?.closest<HTMLElement>(".app-theme")?.style.setProperty("--app-intro-delay", "0s", "important");
    setDone(true);
  }, []);

  const skip = useCallback(() => {
    const element = root.current;
    if (!element || element.classList.contains("app-intro--leaving")) return;
    element.classList.add("app-intro--leaving");
    // The page underneath comes in now rather than when the intro would have ended.
    element.closest<HTMLElement>(".app-theme")?.style.setProperty("--app-intro-delay", "0s", "important");
    setTimeout(finish, SKIP_FADE_MS);
  }, [finish]);

  useEffect(() => {
    markIntroSeen();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const end = reduced ? INTRO_END_REDUCED_MS : INTRO_END_MS;
    const timer = setTimeout(finish, Math.max(0, end - performance.now()));
    // Keyboard and switch users: any key skips, before focus lands on the
    // page hidden underneath.
    document.addEventListener("keydown", skip, { once: true });
    return () => {
      clearTimeout(timer);
      document.removeEventListener("keydown", skip);
    };
  }, [finish, skip]);

  if (done) return null;

  return (
    <div ref={root} className={`${scriptFont} app-intro`} aria-hidden="true" onPointerDown={skip}>
      {/* Back layer: sunset and rings of light, filling the screen. */}
      <svg className="app-intro__scene" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="intro-sun">
            <stop offset="0" stopColor="#f2a66a" stopOpacity="0.85" />
            <stop offset="0.45" stopColor="#d67a44" stopOpacity="0.4" />
            <stop offset="1" stopColor="#d67a44" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="i-sun">
          <circle cx="195" cy="760" r="330" fill="url(#intro-sun)" />
        </g>
        <g className="i-rays" fill="none" stroke="#f3e3d0">
          <circle cx="195" cy="360" r="120" />
          <circle cx="195" cy="360" r="175" />
          <circle cx="195" cy="360" r="235" />
        </g>
      </svg>

      {/* The emblem: always whole on screen (meet), whatever its shape. */}
      <svg className="app-intro__scene" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="intro-halo" cy="0.55">
            <stop offset="0" stopColor="#e08a50" stopOpacity="0.55" />
            <stop offset="0.55" stopColor="#b9643a" stopOpacity="0.22" />
            <stop offset="1" stopColor="#b9643a" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g className="i-emblem">
          <g transform="translate(195 360)">
            {/* The same warm halo as the app icon, so the splash hands over seamlessly. */}
            <circle r="190" cy="10" fill="url(#intro-halo)" />
            <g className="i-ring">
              {BEANS.map((angle) => (
                <g key={angle} transform={`rotate(${angle}) translate(0 -112)`}>
                  <ellipse rx="10" ry="14" fill="#5a3524" stroke="#e2915a" strokeWidth="1.2" />
                  <path d="M -1.5 -11 C 4 -4, -4 4, 1.5 11" fill="none" stroke="#f3e3d0" strokeOpacity="0.55" strokeWidth="1.2" />
                </g>
              ))}
              <circle r="86" fill="none" stroke="#e2915a" strokeOpacity="0.45" strokeDasharray="2 7" strokeLinecap="round" />
              <circle r="140" fill="none" stroke="#f3e3d0" strokeOpacity="0.14" />
            </g>

            <g className="i-cup" fill="none" stroke="#f3e3d0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M -34 -6 L -28 34 C -26 44, -18 48, -8 48 L 8 48 C 18 48, 26 44, 28 34 L 34 -6 Z" />
              <path d="M 33 4 C 52 2, 54 26, 30 28" />
              <path d="M -52 56 C -30 64, 30 64, 52 56" />
            </g>

            <g className="i-steam" fill="none" stroke="#f3e3d0" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.8">
              <path d="M -14 -16 C -24 -30, -4 -40, -14 -56" />
              <path d="M 0 -18 C -10 -34, 10 -46, 0 -66" />
              <path d="M 14 -16 C 4 -30, 24 -40, 14 -56" />
            </g>
          </g>
        </g>
      </svg>

      {/* Front layer: coffee leaves sweeping in from the edges. */}
      <svg className="app-intro__scene" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="intro-leaf" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3a2318" />
            <stop offset="1" stopColor="#6b4129" />
          </linearGradient>
        </defs>
        {LEAVES.map((leaf) => (
          <g key={`${leaf.x}-${leaf.y}`} transform={`translate(${leaf.x} ${leaf.y}) rotate(${leaf.angle})`}>
            <g className="i-leaf" style={{ animationDelay: `${leaf.delay}s, 1.95s` }}>
              <path d="M 0 0 C 34 -46, 104 -56, 170 0 C 104 56, 34 46, 0 0 Z" fill="url(#intro-leaf)" />
              <path d="M 4 0 C 60 -4, 120 -2, 164 0" fill="none" stroke="#f3e3d0" strokeOpacity="0.22" strokeWidth="1.4" />
              <path
                d="M 40 -2 L 62 -20 M 70 -2 L 94 -22 M 100 -1 L 120 -16 M 40 2 L 62 20 M 70 2 L 94 22 M 100 1 L 120 16"
                fill="none"
                stroke="#f3e3d0"
                strokeOpacity="0.12"
                strokeWidth="1"
              />
            </g>
          </g>
        ))}
      </svg>

      <div className="app-intro__text">
        <p className="app-intro__name">{name}</p>
        <IntroFlourish />
        <p className="app-intro__greet">{greeting.title}</p>
        <p className="app-intro__ask">{greeting.ask}</p>
        <p className="app-intro__msg">{greeting.message}</p>
      </div>
    </div>
  );
}

/** The hand-drawn line under the name. */
export function IntroFlourish() {
  return (
    <svg className="app-intro__line" viewBox="0 0 220 24" aria-hidden="true">
      <path d="M6 15 C 48 5, 86 21, 122 12 S 190 6, 214 13" pathLength={1} />
    </svg>
  );
}
