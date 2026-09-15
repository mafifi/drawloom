import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

export default defineConfig({
  site: "https://drawloom.org",
  base: "/",
  output: "static",
  integrations: [svelte()],
  outDir: process.env.JOURNAL_OUT_DIR || "./dist",
  publicDir: "./public",
});
