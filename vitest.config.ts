import { defineConfig } from "vitest/config";

// Only real plugins and the SDK; templates/ holds placeholders that are filled in by `pnpm new`.
export default defineConfig({ test: { include: ["src/**/*.test.ts"] } });
