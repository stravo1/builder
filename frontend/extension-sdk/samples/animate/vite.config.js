/**
 * The build for this extension. See `samples/animate/README.md` for the why.
 *
 * `builderUrl` is the origin the editor is opened on. It has no default: any
 * other origin loads a second SDK instance, whose frames never connect. Change
 * it if your bench serves Builder somewhere else.
 */

import vue from "@vitejs/plugin-vue";
import builderExtension from "frappe-builder-extension-sdk/vite";
import tailwindcss from "tailwindcss";
import IconsEsbuild from "unplugin-icons/esbuild";
import Icons from "unplugin-icons/vite";
import { defineConfig } from "vite";

export default defineConfig({
	css: { postcss: { plugins: [tailwindcss({ config: "./tailwind.config.js" })] } },
	plugins: [Icons({ compiler: "vue3" }), vue(), builderExtension({ builderUrl: "http://builder.localhost:8080" })],
	optimizeDeps: {
		// frappe-ui ships source, and several of its dependencies are CommonJS. A
		// frame importing one of those unbundled fails on a missing named export
		include: [
			"frappe-ui > feather-icons",
			"frappe-ui > debug",
			"engine.io-client",
			"interactjs",
			"highlight.js/lib/core",
		],
		esbuildOptions: { plugins: [IconsEsbuild({ compiler: "vue3" })] },
	},
});
