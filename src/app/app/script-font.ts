import { Great_Vibes } from "next/font/google";

/**
 * The flowing script used for the café's name on the app's home screen and
 * the website's hero. Imported only there, so other screens do not load it.
 */
const script = Great_Vibes({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-app-script",
  display: "swap",
});

/** Put on an element around the `app-script` text. */
export const scriptFont = script.variable;
