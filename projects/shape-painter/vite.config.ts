import { defineConfig } from "vite";

// Served from https://<user>.github.io/creative-lab/projects/shape-painter/
// so asset URLs must be prefixed with that path in production.
export default defineConfig({
  base: "/creative-lab/projects/shape-painter/",
});
