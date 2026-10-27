import { Cormorant_Garamond } from "next/font/google";

/**
 * The customer app's headings (the "dusk" look): an italic calligraphic
 * serif. Body text, prices and buttons stay in the site's plain sans for
 * quick reading. Loaded only by customer-app screens, so the website never
 * downloads it. The café name's script face lives in ./script-font, loaded
 * by the home screen alone.
 */
const heading = Cormorant_Garamond({
  weight: ["500", "600"],
  style: ["italic"],
  subsets: ["latin"],
  variable: "--font-app-heading",
  display: "swap",
});

/** Put on the element that carries the `app-theme` class. */
export const appFonts = heading.variable;
