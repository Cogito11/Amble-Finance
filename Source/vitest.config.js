import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Kept separate from vite.config.js (whose `root` is the Amble/ app folder) so the
// test runner starts from Source/ and finds tests/ without affecting the app build.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.{js,jsx}"],
  },
});
