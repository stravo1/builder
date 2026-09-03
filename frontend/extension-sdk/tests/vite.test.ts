/**
 * The plugin is plain JavaScript, and these tests call its hooks directly rather
 * than running a build. What they check is the config it returns, because that
 * config is the whole plugin.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error — a plain JavaScript module with no types of its own
import builderExtension from "../vite.js";

const BUILDER_URL = "http://builder.localhost:8000";

let roots: string[] = [];

const manifest = (values: Record<string, unknown> = {}) =>
	JSON.stringify({
		v: 1,
		name: "acme/icons",
		label: "Icons",
		description: "Add and manage icons.",
		version: "1.0.0",
		entry: "main.js",
		capabilities: [],
		...values,
	});

const project = (files: Record<string, string>) => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "builder-extension-"));
	roots.push(root);
	Object.entries(files).forEach(([name, content]) => {
		fs.mkdirSync(path.join(root, path.dirname(name)), { recursive: true });
		fs.writeFileSync(path.join(root, name), content);
	});
	return root;
};

const configure = (root: string, command = "build") =>
	builderExtension({ builderUrl: BUILDER_URL }).config({ root }, { command });

/** Both hooks read what `config` worked out, so a plugin is configured before it is asked. */
const configured = (root: string, command: string) => {
	const plugin = builderExtension({ builderUrl: BUILDER_URL });
	plugin.config({ root }, { command });
	return plugin;
};

afterEach(() => {
	roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
	roots = [];
});

describe("builderExtension", () => {
	it("refuses to build without the origin Builder is served on", () => {
		expect(() => builderExtension()).toThrow(/builderUrl/);
	});

	it("takes src/main.js as the entry", () => {
		const root = project({ "src/main.js": "" });

		expect(configure(root).build.rollupOptions.input).toBe(path.join(root, "src/main.js"));
	});

	it("prefers TypeScript where both exist", () => {
		const root = project({ "src/main.js": "", "src/main.ts": "" });

		expect(configure(root).build.rollupOptions.input).toBe(path.join(root, "src/main.ts"));
	});

	it("names both candidates when neither exists", () => {
		const root = project({ "manifest.json": "{}" });

		expect(() => configure(root)).toThrow(/src\/main.ts or src\/main.js/);
	});

	it("keeps the SDK out of the bundle", () => {
		const root = project({ "src/main.js": "" });

		expect(configure(root).build.rollupOptions.external).toEqual(["frappe-builder-extension-sdk"]);
	});

	it("emits the entry under the one name an install holds", () => {
		const root = project({ "src/main.js": "" });

		expect(configure(root).build.rollupOptions.output.entryFileNames).toBe("main.js");
	});

	// the editor reads the entry and posts the code to a frame, so nothing built
	// has a URL left to fetch a second file from
	it("builds to one file", () => {
		const root = project({ "src/main.js": "" });

		const { build } = configure(root);
		expect(build.rollupOptions.output.inlineDynamicImports).toBe(true);
		// a font inlines once per @font-face rule that names it, as base64
		expect(build.assetsInlineLimit).toBe(64 * 1024);
		expect(build.cssCodeSplit).toBe(false);
	});

	/** What Rollup puts in the bundle for one emitted script. */
	const chunk = (isEntry = true) => ({ type: "chunk", isEntry, code: "export {};" });

	/** And for one emitted file. Rollup always names an asset. */
	const asset = (fileName: string, source = "") => ({ type: "asset", fileName, source });

	it("copies the manifest into the build", () => {
		const source = manifest();
		const root = project({ "src/main.js": "", "manifest.json": source });
		const plugin = configured(root, "build");
		const emitFile = vi.fn();

		plugin.generateBundle.handler.call({ emitFile }, {}, {});

		expect(emitFile).toHaveBeenCalledWith({
			type: "asset",
			fileName: "manifest.json",
			source,
		});
	});

	it("refuses a build with no manifest", () => {
		const root = project({ "src/main.js": "" });
		const plugin = configured(root, "build");

		expect(() => plugin.generateBundle.handler.call({ emitFile: vi.fn() }, {}, {})).toThrow(/manifest.json/);
	});

	it("refuses a build whose manifest does not match protocol 1", () => {
		const root = project({ "src/main.js": "", "manifest.json": manifest({ network: ["example.com"] }) });
		const plugin = configured(root, "build");

		expect(() => plugin.generateBundle.handler.call({ emitFile: vi.fn() }, {}, {})).toThrow(
			/unknown field "network"/,
		);
	});

	it("copies the icon to the install root, where the record's URL points", () => {
		const root = project({
			"src/main.js": "",
			"src/icon.svg": "<svg />",
			"manifest.json": manifest({ icon: "icon.svg" }),
		});
		const plugin = configured(root, "build");
		const emitFile = vi.fn();

		plugin.generateBundle.handler.call({ emitFile }, {}, {});

		expect(emitFile).toHaveBeenCalledWith({
			type: "asset",
			fileName: "icon.svg",
			source: Buffer.from("<svg />"),
		});
	});

	it("emits no icon for a manifest that names none", () => {
		const root = project({ "src/main.js": "", "manifest.json": manifest() });
		const plugin = configured(root, "build");
		const emitFile = vi.fn();

		plugin.generateBundle.handler.call({ emitFile }, {}, {});

		expect(emitFile).toHaveBeenCalledTimes(1);
	});

	it("refuses a build whose manifest names an icon that is not there", () => {
		const root = project({ "src/main.js": "", "manifest.json": manifest({ icon: "icon.svg" }) });
		const plugin = configured(root, "build");

		expect(() => plugin.generateBundle.handler.call({ emitFile: vi.fn() }, {}, {})).toThrow(/icon.svg/);
	});

	/**
	 * A frame is handed the entry as code, not a URL, so a relative import inside
	 * it resolves against nothing. The build has to say so, naming the file.
	 */
	it("refuses a build that emitted a second script", () => {
		const root = project({ "src/main.js": "", "manifest.json": manifest() });
		const plugin = configured(root, "build");
		const bundle = { "main.js": chunk(), "lazy-a1b2.js": chunk(false) };

		expect(() => plugin.generateBundle.handler.call({ emitFile: vi.fn() }, {}, bundle)).toThrow(
			/lazy-a1b2\.js/,
		);
	});

	it("refuses a build that emitted a separate asset", () => {
		const root = project({ "src/main.js": "", "manifest.json": manifest() });
		const plugin = configured(root, "build");
		const bundle = { "main.js": chunk(), "logo-c3d4.png": asset("logo-c3d4.png") };

		expect(() => plugin.generateBundle.handler.call({ emitFile: vi.fn() }, {}, bundle)).toThrow(
			/logo-c3d4\.png/,
		);
	});

	it("allows the entry, the manifest and the icon", () => {
		const root = project({
			"src/main.js": "",
			"src/icon.svg": "<svg />",
			"manifest.json": manifest({ icon: "icon.svg" }),
		});
		const plugin = configured(root, "build");
		const bundle = {
			"main.js": chunk(),
			"manifest.json": asset("manifest.json"),
			"icon.svg": asset("icon.svg"),
		};

		expect(() => plugin.generateBundle.handler.call({ emitFile: vi.fn() }, {}, bundle)).not.toThrow();
	});

	// the stylesheet is folded in before the check, so CSS is never a second file
	it("folds the stylesheet into the entry and allows the build", () => {
		const root = project({ "src/main.js": "", "manifest.json": manifest() });
		const plugin = configured(root, "build");
		const entry = chunk();
		const bundle = { "main.js": entry, "style-e5f6.css": asset("style-e5f6.css", "a{}") };

		plugin.generateBundle.handler.call({ emitFile: vi.fn() }, {}, bundle);

		expect(bundle["style-e5f6.css"]).toBeUndefined();
		expect(entry.code).toContain("a{}");
	});

	it("answers a null-origin frame, which Vite does not do on its own", () => {
		const root = project({ "src/main.js": "" });

		expect(configure(root).server.cors).toEqual({ origin: "*" });
	});

	it("lets the dev server read the project and the linked package", () => {
		const root = project({ "src/main.js": "" });

		// the list replaces Vite's default, so the project has to be named too
		const [project_, packaged] = configure(root).server.fs.allow;
		expect(project_).toBe(root);
		expect(packaged).toBe(path.resolve(import.meta.dirname, ".."));
	});
});

describe("the SDK import", () => {
	it("resolves before Vite's own resolver, which would find a file on disk", () => {
		expect(builderExtension({ builderUrl: BUILDER_URL }).enforce).toBe("pre");
	});

	it("names Builder's own URL in a dev server", () => {
		const root = project({ "src/main.js": "" });

		expect(configured(root, "serve").resolveId("frappe-builder-extension-sdk")).toEqual({
			id: `${BUILDER_URL}/builder_extension_asset/sdk/extension-sdk.js`,
			external: true,
		});
	});

	it("keeps the bare specifier in a build, where the import map resolves it", () => {
		const root = project({ "src/main.js": "" });

		expect(configured(root, "build").resolveId("frappe-builder-extension-sdk")).toBe(undefined);
	});

	it("takes a builderUrl with a trailing slash", () => {
		const root = project({ "src/main.js": "" });
		const plugin = builderExtension({ builderUrl: `${BUILDER_URL}/` });
		plugin.config({ root }, { command: "serve" });

		expect(plugin.resolveId("frappe-builder-extension-sdk").id).toBe(
			`${BUILDER_URL}/builder_extension_asset/sdk/extension-sdk.js`,
		);
	});

	it("leaves every other import alone", () => {
		const root = project({ "src/main.js": "" });

		expect(configured(root, "serve").resolveId("vue")).toBe(undefined);
	});
});

describe("hot reload", () => {
	const entryOf = (root: string) => path.join(root, "src/main.js");

	it("loads Vite's client from the entry, because no HTML here does", () => {
		const root = project({ "src/main.js": "" });

		const result = configured(root, "serve").transform("REST", entryOf(root));

		expect(result.code).toBe('import "/@vite/client";\nREST');
	});

	it("leaves every other module alone", () => {
		const root = project({ "src/main.js": "" });

		expect(configured(root, "serve").transform("REST", `${entryOf(root)}x`)).toBe(undefined);
	});

	it("adds nothing to a build", () => {
		const root = project({ "src/main.js": "" });

		expect(configured(root, "build").transform("REST", entryOf(root))).toBe(undefined);
	});
});

describe("the descriptor", () => {
	/** What the middleware wrote, by driving the response object it is handed. */
	const read = (root: string) => {
		const plugin = configured(root, "serve");
		let handler = (_request: unknown, _response: unknown) => {};
		plugin.configureServer({ middlewares: { use: (_path: string, fn: never) => (handler = fn) } });

		let body = "";
		const headers: Record<string, string> = {};
		handler(
			{},
			{
				setHeader: (name: string, value: string) => (headers[name] = value),
				end: (written: string) => (body = written),
			},
		);
		return { body: JSON.parse(body), headers };
	};

	it("names the extension, its grants and the entry the frame imports", () => {
		const root = project({
			"src/main.js": "",
			"manifest.json": manifest({ version: "2.1.0", capabilities: ["block.update"] }),
		});

		expect(read(root).body).toEqual({
			v: 1,
			name: "acme/icons",
			label: "Icons",
			description: "Add and manage icons.",
			version: "2.1.0",
			capabilities: ["block.update"],
			// the dev server serves the source path, not the built name
			entry: "/src/main.js",
		});
	});

	it("asks for nothing when the manifest grants nothing", () => {
		const root = project({ "src/main.js": "", "manifest.json": manifest() });

		expect(read(root).body.capabilities).toEqual([]);
	});

	it("includes the project README for the details page", () => {
		const root = project({
			"src/main.js": "",
			"manifest.json": manifest(),
			"README.md": "# Icons\n\nDevelopment documentation.\n",
		});

		expect(read(root).body.readme).toBe("# Icons\n\nDevelopment documentation.\n");
	});

	it("names the icon where the dev server serves it, not where a build puts it", () => {
		const root = project({
			"src/main.js": "",
			"src/icon.svg": "<svg />",
			"manifest.json": manifest({ icon: "icon.svg" }),
		});

		expect(read(root).body.icon).toBe("/src/icon.svg");
	});

	it("is readable from the editor, which is another origin", () => {
		const root = project({ "src/main.js": "", "manifest.json": manifest() });

		// this middleware runs before Vite's own, so it sets the header itself
		expect(read(root).headers["Access-Control-Allow-Origin"]).toBe("*");
	});
});
