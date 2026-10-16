import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    // Bound memory when the complete Docker environment runs alongside tests.
    maxWorkers: 2, environment: "node", include: ["tests/**/*.test.ts", "src/lib/auth/**/*.test.ts"] },
});
