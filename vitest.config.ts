// vitest.config.ts
import path from "path";

import { defineConfig } from "vitest/config";

export default defineConfig({
    resolve: {
        alias: {
            "@root": path.resolve(__dirname, "./")
        }
    },
    test: {
        testTimeout: 30 * 1000,
        exclude: [
            "**/node_modules/**",
            "**/dist/**", // ← 排除 dist
            "**/build/**",
            "**/.{git,cache,output,temp}/**"
        ]
    }
});
