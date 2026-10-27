import { Great_Vibes } from "next/font/google";

/**
 * The flowing script used for the café's name on the home screen. Imported
 * only there, so other screens neither load nor preload it.
 */
const script = Great_Vibes({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-app-script",
  display: "swap",
});

/** Put on an element around the `app-script` text. */
export const scriptFont = script.variable;
