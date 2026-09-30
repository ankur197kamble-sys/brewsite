/**
 * Tenant resolution.
 *
 * There are two distinct questions, and conflating them is a security bug:
 *
 * 1. Which café does this PUBLIC page render? Anyone may view it, so this
 *    cannot depend on a session. Today it is the single prototype café; it
 *    becomes a domain/subdomain lookup when the platform hosts many cafés.
 *
 * 2. Which café may this REQUEST modify? That always comes from the
 *    authenticated session — see `getCafeSession` in `@/app/lib/session`.
 *    A cafeId is never read from client input.
 */
export function getPublicCafeId(): number {
  return 1;
}
