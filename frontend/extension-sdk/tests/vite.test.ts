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

	it("emits the entry under the one name the record's URL ends in", () => {
		const root = project({ "src/main.js": "" });

		const { output } = configure(root).build.rollupOptions;
		expect(output.entryFileNames).toBe("main.js");
		// a chunk is immutable under one install, so it carries a hash
		expect(output.chunkFileNames).toBe("[name]-[hash].js");
	});

	it("copies the manifest into the build", () => {
		const root = project({ "src/main.js": "", "manifest.json": '{"name":"acme/icons"}' });
		const plugin = configured(root, "build");
		const emitFile = vi.fn();

		plugin.generateBundle.handler.call({ emitFile }, {}, {});

		expect(emitFile).toHaveBeenCalledWith({
			type: "asset",
			fileName: "manifest.json",
			source: '{"name":"acme/icons"}',
		});
	});

	it("refuses a build with no manifest", () => {
		const root = project({ "src/main.js": "" });
		const plugin = configured(root, "build");

		expect(() => plugin.generateBundle.handler.call({ emitFile: vi.fn() }, {}, {})).toThrow(/manifest.json/);
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
		expect(packaged).toMatch(/extension-sdk$/);
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
			"manifest.json": JSON.stringify({
				name: "acme/icons",
				label: "Icons",
				version: "2.1.0",
				capabilities: ["block.update"],
			}),
		});

		expect(read(root).body).toEqual({
			v: 1,
			name: "acme/icons",
			label: "Icons",
			version: "2.1.0",
			capabilities: ["block.update"],
			// the dev server serves the source path, not the built name
			entry: "/src/main.js",
		});
	});

	it("asks for nothing when the manifest grants nothing", () => {
		const root = project({ "src/main.js": "", "manifest.json": JSON.stringify({ name: "acme/icons" }) });

		expect(read(root).body.capabilities).toEqual([]);
	});

	it("is readable from the editor, which is another origin", () => {
		const root = project({ "src/main.js": "", "manifest.json": JSON.stringify({ name: "acme/icons" }) });

		// this middleware runs before Vite's own, so it sets the header itself
		expect(read(root).headers["Access-Control-Allow-Origin"]).toBe("*");
	});
});
