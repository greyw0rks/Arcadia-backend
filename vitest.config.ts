import { defineConfig } from "vitest/config";

// Unit tests for pure server logic (e.g. bet-scaled difficulty). Node environment — no DOM needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    // .claude/worktrees holds abandoned agent checkouts with stale copies of these same tests.
    // Without this they run alongside the real suite and fail against current source.
    exclude: ["**/node_modules/**", "**/.claude/**", "**/dist/**"],
    // signer.test.ts dynamically imports viem inside beforeAll (env must be set before load).
    // Cold-transforming viem alone runs past the 10s default, and CI runners are slower still.
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
});
