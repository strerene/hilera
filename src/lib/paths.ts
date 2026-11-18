/**
 * Absolute URL path inside the deployment base (`/hilera/` on GitHub Pages).
 *
 * Solid Router never prefixes the base itself for a leading `/`: its
 * `resolvePath` treats `"/about"` as a full document path and writes it as-is,
 * so `navigate("/")` leaves the base and the router can no longer match it.
 * Hrefs have the same rule — the router only claims an anchor whose URL sits
 * inside the base. Every in-app path therefore goes through here.
 *
 * `BASE_URL` is a build constant (`"/"` or `"/hilera/"`), so this yields the
 * same string during the build-time render and in the browser.
 */
export function appPath(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}
