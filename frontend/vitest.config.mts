import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		// the SDK package serves "source" in this repo, so a test reads its
		// TypeScript and not a dist build that may be stale or missing
		conditions: ["source", "module", "browser", "development|production"],
		alias: {
			"@": path.resolve(__dirname, "src"),
		},
	},
	// a test runs in Node, which Vite resolves through its SSR conditions
	ssr: { resolve: { conditions: ["source", "module", "node", "development|production"] } },
	test: {
		include: ["src/**/*.test.ts", "extension-sdk/**/*.test.ts"],
	},
});
