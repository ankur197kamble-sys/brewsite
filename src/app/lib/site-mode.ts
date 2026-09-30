/**
 * Preview mode, for a site shown to a café before they sign up.
 *
 * Set `SITE_PREVIEW=true` in the hosting environment and every page tells
 * search engines not to list it (a `noindex` meta tag plus an `X-Robots-Tag`
 * header), so a demo built from a café's public details is never mistaken
 * for their official site. The site still works normally for anyone given
 * the link. Remove the variable and redeploy once the café is a customer.
 */
export const isPreview = process.env.SITE_PREVIEW === "true";
