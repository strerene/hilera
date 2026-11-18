import path from "node:path";
import { defineConfig } from "vite";
import solid from "@solidjs/vite-plugin";
import { fileRoutes } from "filesystem-routing/vite";
import { prerender } from "prerender-crawler/vite";
import tailwindcss from "@tailwindcss/vite";

// Vite normalises `base` for the client, but the shell prerender sees the raw
// value from the environment, so guarantee the trailing slash here: every
// `import.meta.env.BASE_URL` consumer (the router's `base`, the favicon links
// in Document) then joins correctly with or without the deployed prefix.
const basePath = `${process.env.BASE_PATH ?? "/"}`.replace(/\/?$/, "/");

// Prerender seeds are requested against the router, which matches only inside the
// deployment base (`/hilera` on GitHub Pages), while the output filenames stay
// base-free because the host supplies the prefix. Hence both halves are explicit.
const prerenderBase = basePath.replace(/\/$/, "");
const page = (route: string, filename: string) => ({
  path: `${prerenderBase}${route}`,
  filename,
});

export default defineConfig({
  base: basePath,
  resolve: {
    // Start mode does not supply the SolidStart `~` alias, so declare it here.
    alias: { "~": path.resolve(import.meta.dirname, "src") },
  },
  plugins: [
    tailwindcss(),
    // `start: true` + `ssr: true`: the app renders on the server, once per page
    // during the build-time crawl below, and hydrates in the browser. The
    // deployed artifact is still just `dist/client`.
    solid({
      start: true,
      ssr: true,
      // filesystem-routing hands the Solid transform route modules under a
      // query-suffixed id.
      extensions: [".jsx", ".tsx"],
    }),
    // Routes are delivered eagerly: this is a small app, so per-chunk overhead
    // loses to a single bundle.
    fileRoutes({ types: true, codeSplitting: false }),
    // Static prerendering: render each seeded page through the built handler and
    // write its HTML into `dist/client`, so content pages ship as real documents
    // and hydrate. `/room` is seeded because it is not linked from anywhere
    // (guests arrive by shared URL), and `/404` is written as `404.html` so a
    // static host's fallback is a page rendered for the route it hydrates as.
    // Link crawling is off: this app has four routes and all are listed.
    prerender({
      mode: "static",
      crawlLinks: false,
      pages: [
        page("/", "index.html"),
        page("/about", "about/index.html"),
        page("/privacy", "privacy/index.html"),
        page("/room", "room/index.html"),
        page("/404", "404.html"),
      ],
    }),
  ],
});
