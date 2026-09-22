import { defineConfig } from "vitest/config";
import sourceConfig from "./vitest.config";

export default defineConfig({
  ...sourceConfig,
  test: {
    ...sourceConfig.test,
    // This lane needs Vite's source resolution without enrolling its slow
    // integration in the default test collection.
    include: ["apps/desktop/tests/learning-journey-orchestration.integration.test.ts"],
  },
});
