import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["test/index.spec.ts", "test/auth.spec.ts"], environment: "node" },
});
