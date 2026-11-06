import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./lib/test-setup.ts"],
    include: ["lib/**/*.test.ts"],
  },
});
