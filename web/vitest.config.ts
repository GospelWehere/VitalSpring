import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

function loadEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {};
  try {
    const content = readFileSync(fileURLToPath(new URL(".env.local", import.meta.url)), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.local: tests will fail with a clear DATABASE_URL error.
  }
  return env;
}

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: loadEnvLocal(),
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
