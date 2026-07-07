// Modified by Friday AI Team - Rebranded from Continue
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.vitest.ts"],
    environment: "node",
  },
});
