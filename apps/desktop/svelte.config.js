import adapter from "@sveltejs/adapter-static";
// Stage verification builds without replacing assets served by a running desktop.
const output = process.env.DRAWLOOM_WEB_BUILD_DIR ?? "build";
export default {
  kit: { adapter: adapter({ pages: output, assets: output, fallback: "index.html" }) },
};
