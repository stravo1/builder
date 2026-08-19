/**
 * `@builder/extension-sdk/vite` — the build an extension author runs.
 *
 * Plain JavaScript on purpose. Vite hands a config's own imports to Node, and
 * Node refuses to strip types from any file under `node_modules`, so a
 * TypeScript plugin cannot be loaded by the config that uses it.
 *
 * ```js
 * import builderExtension from "@builder/extension-sdk/vite";
 * export default defineConfig({ plugins: [vue(), builderExtension({ builderUrl })] });
 * ```
 */

import fs from "node:fs";
import path from "node:path";

const SDK = "@builder/extension-sdk";
const MANIFEST = "manifest.json";

/** The record derives one URL per install, and it ends in this name. */
const OUTPUT_ENTRY = "main.js";

/** One entry, so Rollup sees the whole graph and shared code lands in one chunk. */
const ENTRY_CANDIDATES = ["src/main.ts", "src/main.js"];

const findEntry = (root) => {
	const found = ENTRY_CANDIDATES.find((candidate) => fs.existsSync(path.join(root, candidate)));
	if (found) return path.join(root, found);
	throw new Error(`[builder] no extension entry: expected one of ${ENTRY_CANDIDATES.join(" or ")}`);
};

const readManifest = (root) => {
	const file = path.join(root, MANIFEST);
	if (!fs.existsSync(file)) throw new Error(`[builder] no ${MANIFEST} beside vite.config.js`);
	return fs.readFileSync(file, "utf8");
};

/**
 * @param {{ builderUrl: string }} options `builderUrl` is the origin the editor
 * is opened on. It has no default: the dev server imports the SDK from it by
 * absolute URL, and an origin that is not the one serving the editor loads a
 * second SDK instance, whose frames never connect.
 */
export default function builderExtension({ builderUrl } = {}) {
	if (!builderUrl) {
		throw new Error('[builder] builderExtension() needs "builderUrl", the origin Builder is served on');
	}

	let root = process.cwd();

	return {
		name: "builder-extension",

		config(config) {
			root = path.resolve(config.root ?? process.cwd());
			return {
				// every asset is fetched relative to the module that names it, because
				// an install lives under /builder_extension_asset/<name>@<version>/ and
				// the default base would fetch a chunk's stylesheet from the site root
				base: "./",
				// the frame is a modern browser by definition: it runs module scripts
				build: {
					target: "es2020",
					rollupOptions: {
						input: findEntry(root),
						// never bundled: the frame shell's import map resolves it to the
						// one instance Builder serves, for the entry and every chunk
						external: [SDK],
						output: {
							entryFileNames: OUTPUT_ENTRY,
							chunkFileNames: "[name]-[hash].js",
							assetFileNames: "[name]-[hash][extname]",
						},
					},
				},
			};
		},

		/** The install reads it for the identity, the version and the capabilities. */
		generateBundle() {
			this.emitFile({ type: "asset", fileName: MANIFEST, source: readManifest(root) });
		},
	};
}
