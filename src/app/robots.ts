import type { MetadataRoute } from "next";

/**
 * The dashboard, login and API are never for search engines. Public pages
 * stay crawlable even in preview mode: crawlers must be able to read the
 * `noindex` signal to honour it (a page blocked here can still be listed from
 * links, just without its content).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard", "/login", "/api/"],
    },
  };
}
