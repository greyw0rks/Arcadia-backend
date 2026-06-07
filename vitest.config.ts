import { defineConfig } from "vitest/config";

// Unit tests for pure server logic (e.g. bet-scaled difficulty). Node environment — no DOM needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
  },
});
