/**
 * The café's time zone. Calendar days (offer dates, "today's orders", the
 * daily order numbers) and clock times are read in it rather than in the
 * server's or the phone's zone: hosts typically run on UTC, which would put
 * an Indian café's day 5½ hours late. Platform default until time zone
 * becomes a per-café setting. Safe to import from client components.
 */
export const CAFE_TIME_ZONE = "Asia/Kolkata";
