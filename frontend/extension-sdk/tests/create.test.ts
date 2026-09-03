import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createExtension, slugify } from "../create.js";

const roots: string[] = [];

const temporaryDirectory = () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "builder-extension-create-"));
	roots.push(root);
	return root;
};

const options = (root: string, values: Record<string, unknown> = {}) => ({
	cwd: root,
	name: "Sample Plugin",
	publisher: "Acme Labs",
	description: "",
	builderUrl: "http://builder.localhost:8080",
	copyrightHolder: "Ada Example",
	...values,
});

afterEach(() => {
	roots.forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
	roots.length = 0;
});

describe("createExtension", () => {
	it("creates a publishable TypeScript Vue extension and initializes Git", () => {
		const root = temporaryDirectory();
		const created = createExtension(options(root));
		const manifest = JSON.parse(fs.readFileSync(path.join(created.directory, "manifest.json"), "utf8"));
		const packageJson = JSON.parse(fs.readFileSync(path.join(created.directory, "package.json"), "utf8"));

		expect(created.extensionId).toBe("acme-labs/sample-plugin");
		expect(created.directory).toBe(path.join(root, "sample-plugin"));
		expect(manifest).toMatchObject({
			name: "acme-labs/sample-plugin",
			label: "Sample Plugin",
			description: "A Frappe Builder extension.",
			version: "1.0.0",
			capabilities: ["context.read", "block.insert", "ui.popover"],
		});
		expect(packageJson).toMatchObject({
			name: "@acme-labs/sample-plugin",
			private: true,
			author: "Ada Example",
		});
		expect(fs.existsSync(path.join(created.directory, ".git/HEAD"))).toBe(true);
		expect(fs.existsSync(path.join(created.directory, "package-lock.json"))).toBe(false);
		expect(fs.existsSync(path.join(created.directory, "node_modules"))).toBe(false);
	});

	it("generates the agreed sample behavior and release workflow", () => {
		const root = temporaryDirectory();
		const { directory } = createExtension(options(root, { initializeGit: false }));
		const main = fs.readFileSync(path.join(directory, "src/main.ts"), "utf8");
		const popover = fs.readFileSync(path.join(directory, "src/Popover.vue"), "utf8");
		const workflow = fs.readFileSync(path.join(directory, ".github/workflows/release.yml"), "utf8");

		expect(main).toContain('region: "right"');
		expect(main).toContain('icon: "lucide-blocks"');
		expect(main).toContain("width: 420");
		expect(main).toContain("height: 560");
		expect(popover).toContain("useBuilderContext");
		expect(popover).toContain("builder.block.insert(context.selection.blockId");
		expect(popover).not.toContain("index:");
		expect(workflow).toContain("release:");
		expect(workflow).toContain('npm run package -- --tag "$RELEASE_TAG"');
		expect(workflow).not.toContain("--clobber");
	});

	it("uses an explicit directory and refuses a non-empty one", () => {
		const root = temporaryDirectory();
		const directory = path.join(root, "chosen");
		fs.mkdirSync(directory);
		fs.writeFileSync(path.join(directory, "mine.txt"), "keep");

		expect(() => createExtension(options(root, { directory: "chosen" }))).toThrow(/not empty/);
		expect(fs.readFileSync(path.join(directory, "mine.txt"), "utf8")).toBe("keep");
	});

	it("normalizes names and publishers", () => {
		expect(slugify(" Crème & Widgets ")).toBe("creme-widgets");
	});
});
