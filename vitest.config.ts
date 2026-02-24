import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/smoke/**/*.test.ts",
    ],
    clearMocks: true,
    restoreMocks: true,
  },
});
