/**
 * Shared by the server layout (which decides whether to show the intro) and
 * the intro itself. Kept out of the "use client" intro module: a server
 * component importing a plain value from a client module gets a reference,
 * not the value.
 */

/** Set once the intro has played, so it shows once per visit (browser session). */
export const INTRO_COOKIE = "brewsite_intro";

/** How long the first screen waits behind the intro (matches .app-intro timing). */
export const INTRO_HOLD = "4.9s";
