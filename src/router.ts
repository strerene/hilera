import { createRouter } from "@solidjs/router";
import { fileRoutes } from "@solidjs/router/fs";
import { pageRoutes } from "virtual:file-routes";

/**
 * Solid 2 routers are instances, not a `<Router>` component with a `root` prop
 * (the SolidStart spelling). `fileRoutes` converts the file-system manifest
 * from `filesystem-routing` into route definitions; `base` carries the
 * `BASE_PATH` deployment prefix used by `gh-pages:build`.
 */
export const Router = createRouter({
  routes: fileRoutes(pageRoutes),
  base: import.meta.env.BASE_URL,
});
