import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
	build: {
		copyPublicDir: false,
		lib: {
			entry: path.resolve(__dirname, "src/runtime/reactivity.ts"),
			name: "reactivity",
			formats: ["iife"],
			fileName: () => "reactivity.js",
		},
		outDir: path.resolve(__dirname, "../builder/public/js"),
		emptyOutDir: false,
		target: "es2015",
		minify: true,
	},
});
