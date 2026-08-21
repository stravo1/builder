import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";

const canvas = { activeCanvas: null as { getRootBlock: () => unknown } | null };
const store = { activePage: null as { name: string; route: string } | null };

vi.mock("@/stores/canvasStore", () => ({ default: () => canvas }));
vi.mock("@/stores/pageStore", () => ({ default: () => store }));
vi.mock("@/utils/helpers", () => ({
	getBlockObject: (block: Record<string, unknown>) => ({ copied: block.blockId }),
}));

/** The Frappe call is mocked. Under test is the page it targets, and the confirmation. */
const submitted: Array<{ url: string; params: Record<string, unknown> }> = [];
let answer: unknown = {};

vi.mock("frappe-ui", () => ({
	createResource: ({ url }: { url: string }) => ({
		submit: (params: Record<string, unknown>) => {
			submitted.push({ url, params });
			return Promise.resolve(reactive({ value: answer }).value as object);
		},
	}),
}));

let allowed = true;
const asked: string[] = [];

vi.mock("../../data/grants", () => ({
	confirmPageScript: (_extension: unknown, route: string) => {
		asked.push(route);
		return Promise.resolve(allowed);
	},
}));

import { pageMethods } from "../pageMethods";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";

const record = (): InstalledExtension => ({
	name: "acme/a11y",
	label: "Accessibility",
	entry: "/builder_extension_asset/acme-a11y@1.0.0/main.js",
	capabilities: ["page.read", "page.write"],
});

const getBlocks = () => pageMethods["page.getBlocks"].run(undefined, record());
const run = (method: string, params?: unknown) => pageMethods[method].run(params, record());

/** The one call every script method makes first, so a test can set what it answers. */
const listed = (rows: unknown) => (answer = rows);

beforeEach(() => {
	canvas.activeCanvas = null;
	store.activePage = { name: "page-1", route: "landing" };
	submitted.length = 0;
	asked.length = 0;
	allowed = true;
	listed([]);
});

describe("page.getBlocks", () => {
	it("needs page.read", () => {
		expect(pageMethods["page.getBlocks"].needs).toBe("page.read");
	});

	it("answers with the canvas root, as a list", () => {
		canvas.activeCanvas = { getRootBlock: () => ({ blockId: "root" }) };

		expect(getBlocks()).toEqual([{ copied: "root" }]);
	});

	// an extension that called before the editor was ready must be able to tell
	// that apart from a page with nothing on it
	it("refuses when no canvas is open", () => {
		try {
			getBlocks();
			expect.unreachable("a missing canvas must refuse");
		} catch (error) {
			expect((error as { code?: string }).code).toBe("no_canvas");
		}
	});

	it("refuses when the canvas holds no root block", () => {
		canvas.activeCanvas = { getRootBlock: () => null };

		expect(() => getBlocks()).toThrow();
	});
});

describe("page.attachScript", () => {
	it("needs page.write", () => {
		expect(pageMethods["page.attachScript"].needs).toBe("page.write");
	});

	it("names the open page, never one the caller chose", async () => {
		await run("page.attachScript", { type: "JavaScript", script: "console.log(1)" });

		expect(submitted.at(-1)).toEqual({
			url: "builder.extension_page.attach_script",
			params: {
				extension: "acme/a11y",
				page: "page-1",
				script_type: "JavaScript",
				script: "console.log(1)",
			},
		});
	});

	// the confirmation is about running this extension's code on this page at all
	it("asks the user before it creates the first script of a type", async () => {
		await run("page.attachScript", { type: "CSS", script: "a{}" });

		expect(asked).toEqual(["landing"]);
	});

	it("writes nothing when the user says no", async () => {
		allowed = false;

		await expect(run("page.attachScript", { type: "CSS", script: "a{}" })).rejects.toMatchObject({
			code: "refused",
		});
		expect(submitted.map((call) => call.url)).toEqual(["builder.extension_page.list_scripts"]);
	});

	// the answer would not go stale when the extension ships the same script again
	it("does not ask again to rewrite a script it already owns", async () => {
		listed([{ name: "JavaScript-abc", type: "JavaScript", script: "old" }]);

		await run("page.attachScript", { type: "JavaScript", script: "new" });

		expect(asked).toEqual([]);
	});

	it("still asks when it owns a script of the other type", async () => {
		listed([{ name: "CSS-abc", type: "CSS", script: "a{}" }]);

		await run("page.attachScript", { type: "JavaScript", script: "new" });

		expect(asked).toEqual(["landing"]);
	});

	it("refuses a script type Builder does not have", async () => {
		await expect(run("page.attachScript", { type: "Python", script: "x" })).rejects.toMatchObject({
			code: "invalid_params",
		});
	});

	it("refuses when no page is open", async () => {
		store.activePage = null;

		await expect(run("page.attachScript", { type: "CSS", script: "a{}" })).rejects.toMatchObject({
			code: "no_page",
		});
	});
});

describe("page.detachScript", () => {
	it("asks the server to drop this extension's script of that type", async () => {
		await run("page.detachScript", { type: "CSS" });

		expect(submitted.at(-1)).toEqual({
			url: "builder.extension_page.detach_script",
			params: { extension: "acme/a11y", page: "page-1", script_type: "CSS" },
		});
	});

	it("never asks the user, because removing code takes nothing away", async () => {
		await run("page.detachScript", { type: "CSS" });

		expect(asked).toEqual([]);
	});
});

describe("page.listScripts", () => {
	it("reads the open page", async () => {
		await run("page.listScripts");

		expect(submitted.at(-1)).toEqual({
			url: "builder.extension_page.list_scripts",
			params: { extension: "acme/a11y", page: "page-1" },
		});
	});
});
