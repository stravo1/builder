import { beforeEach, describe, expect, it, vi } from "vitest";

const canvas = { activeCanvas: null as { getRootBlock: () => unknown } | null };

vi.mock("@/stores/canvasStore", () => ({ default: () => canvas }));
vi.mock("@/utils/helpers", () => ({
	getBlockObject: (block: Record<string, unknown>) => ({ copied: block.blockId }),
}));

import { pageMethods } from "../pageMethods";
import type { InstalledExtension } from "frappe-builder-extension-sdk/types";

const record = (): InstalledExtension => ({
	name: "acme/a11y",
	label: "Accessibility",
	entry: "/builder_extension_asset/acme-a11y@1.0.0/main.js",
	capabilities: ["page.read"],
});

const getBlocks = () => pageMethods["page.getBlocks"].run(undefined, record());

beforeEach(() => (canvas.activeCanvas = null));

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
