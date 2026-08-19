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

const configure = (root: string) => builderExtension({ builderUrl: BUILDER_URL }).config({ root });

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

		expect(configure(root).build.rollupOptions.external).toEqual(["@builder/extension-sdk"]);
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
		const plugin = builderExtension({ builderUrl: BUILDER_URL });
		const emitFile = vi.fn();

		plugin.config({ root });
		plugin.generateBundle.call({ emitFile });

		expect(emitFile).toHaveBeenCalledWith({
			type: "asset",
			fileName: "manifest.json",
			source: '{"name":"acme/icons"}',
		});
	});

	it("refuses a build with no manifest", () => {
		const root = project({ "src/main.js": "" });
		const plugin = builderExtension({ builderUrl: BUILDER_URL });

		plugin.config({ root });

		expect(() => plugin.generateBundle.call({ emitFile: vi.fn() })).toThrow(/manifest.json/);
	});
});
