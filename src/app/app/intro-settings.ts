/**
 * Shared by the server layout (which decides whether to show the intro) and
 * the intro itself. Kept out of the "use client" intro module: a server
 * component importing a plain value from a client module gets a reference,
 * not the value.
 */

/**
 * Set when the intro plays; while it is there the intro does not play again.
 * It expires after INTRO_REST_SECONDS, so opening the app after a break
 * plays the intro again. (A browser-session cookie was not enough: Chrome
 * on Android keeps "session" cookies for days, so the intro rarely showed.)
 * Renamed from "brewsite_intro" so phones still holding that one see the
 * intro again straight away.
 */
export const INTRO_COOKIE = "brewsite_intro_seen";

/** Away this long, and the intro plays again on the next open in a browser. */
export const INTRO_REST_SECONDS = 30 * 60;

/**
 * The installed app opens at /app?launch=1 (the manifest's start_url), so a
 * launch from the home-screen icon always plays the intro, like a native
 * app's opening animation, whenever the intro was last seen.
 */
export const LAUNCH_PARAM = "launch";

/** How long the first screen waits behind the intro (matches .app-intro timing). */
export const INTRO_HOLD = "4.9s";
