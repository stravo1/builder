import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "src"),
			// the package entry, so a test resolves the specifier an author writes
			"@builder/extension-sdk": path.resolve(__dirname, "extension-sdk/index.ts"),
		},
	},
	test: {
		include: ["src/**/*.test.ts", "extension-sdk/**/*.test.ts"],
	},
});
