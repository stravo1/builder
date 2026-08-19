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
import { fileURLToPath } from "node:url";

const SDK = "@builder/extension-sdk";
const MANIFEST = "manifest.json";

/** Where Builder serves the one SDK instance every frame of an extension shares. */
const SDK_PATH = "/builder_extension_asset/sdk/extension-sdk.js";

/** What the editor reads to learn what this dev server is serving. */
const DESCRIPTOR_PATH = "/__builder-extension";

/** Vite's hot reload client. It resolves against the dev server, which serves the entry. */
const HMR_CLIENT = "/@vite/client";

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

	const sdkUrl = `${builderUrl.replace(/\/$/, "")}${SDK_PATH}`;

	let root = process.cwd();
	let entry = "";
	let serving = false;

	return {
		name: "builder-extension",
		// before Vite's own resolver, or it resolves the SDK to a file on disk and
		// the frame ends up with a second instance of it
		enforce: "pre",

		config(config, env) {
			root = path.resolve(config.root ?? process.cwd());
			entry = findEntry(root);
			serving = env.command === "serve";
			return {
				// every asset is fetched relative to the module that names it, because
				// an install lives under /builder_extension_asset/<name>@<version>/ and
				// the default base would fetch a chunk's stylesheet from the site root
				base: "./",
				// the frame is a modern browser by definition: it runs module scripts
				build: {
					target: "es2020",
					rollupOptions: {
						input: entry,
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
				server: {
					// an extension frame runs at an opaque origin, so it sends
					// `Origin: null`, and Vite answers such a request with no CORS
					// header at all
					cors: { origin: "*" },
					// the package is installed by a link, so it resolves outside this
					// project and the dev server would refuse to serve it. The project
					// itself has to be named too: this list replaces the default rather
					// than adding to it
					fs: { allow: [root, path.dirname(fileURLToPath(import.meta.url))] },
				},
			};
		},

		/**
		 * Names Builder's own URL for the SDK, rather than leaving the specifier
		 * for the frame's import map.
		 *
		 * Measured: `external: true` alone does not survive a dev server. Vite
		 * rewrites the bare specifier to `/@id/@builder/extension-sdk`, the browser
		 * asks the dev server for it, and the import map never sees it. The frame
		 * would then hold a second SDK instance, with no port and no channel.
		 *
		 * An absolute URL is left alone, and it resolves to the same module the
		 * frame shell already loaded — as long as `builderUrl` is the origin the
		 * editor is open on. That is why the option has no default.
		 */
		resolveId(id) {
			if (serving && id === SDK) return { id: sdkUrl, external: true };
		},

		/**
		 * Loads Vite's hot reload client, which nothing else here would.
		 *
		 * Vite injects it into the HTML it serves. An extension frame is served by
		 * Builder instead, so the client never arrives — and `@vitejs/plugin-vue`
		 * emits `import.meta.hot.accept(...)` with no guard, because it assumes the
		 * client defined it. Without this the first component to load throws while
		 * it evaluates, inside a frame, with nothing printed anywhere.
		 */
		transform(code, id) {
			if (!serving || id !== entry) return;
			return { code: `import ${JSON.stringify(HMR_CLIENT)};\n${code}`, map: null };
		},

		/** What "load development extension" reads: identity, grants, and the entry. */
		configureServer(server) {
			server.middlewares.use(DESCRIPTOR_PATH, (request, response) => {
				const manifest = JSON.parse(readManifest(root));
				response.setHeader("Content-Type", "application/json");
				// a middleware added here runs before Vite's own, so the CORS setting
				// above has not been applied yet. The editor reads this cross-origin
				response.setHeader("Access-Control-Allow-Origin", "*");
				response.end(
					JSON.stringify({
						v: 1,
						name: manifest.name,
						label: manifest.label,
						version: manifest.version,
						capabilities: manifest.capabilities ?? [],
						entry: `/${path.relative(root, entry)}`,
					}),
				);
			});
		},

		/** The install reads it for the identity, the version and the capabilities. */
		generateBundle() {
			this.emitFile({ type: "asset", fileName: MANIFEST, source: readManifest(root) });
		},
	};
}
