import { defineConfig } from "vitest/config";

// The IRS link check (tests-network/) talks to the internet, so it has its own config and its own
// command (`npm run check:irs-links`) and never runs as part of `npm test`.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests-network/**/*.test.js"],
  },
});
