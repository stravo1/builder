import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** The real registry, without the 23 built-in rows and the stores they resolve. */
vi.mock("@/components/BlockContextMenuOptions", async () => ({
	blockContextMenuOptions: (await import("@/utils/createRegistry")).createRegistry(),
}));

const snapshot = vi.hoisted(() => ({
	value: { selection: { count: 1, blockIds: ["block-1"] }, breakpoint: "desktop", readOnly: false },
}));
const facts = vi.hoisted(() => vi.fn());
vi.mock("../../editor/editorContext", () => ({ editorContext: snapshot, factsFor: facts }));

const invoked = vi.hoisted(() => vi.fn());
vi.mock("../actionMethods", () => ({ invokeAction: invoked, actionMethods: {} }));

import { blockContextMenuOptions } from "@/components/BlockContextMenuOptions";
import type { BlockMenuContext } from "@/types/blockContextMenu";
import { bridge } from "../../host/bridge";
import type { InstalledExtension } from "../../types";
import { contextMenuMethods } from "../contextMenuMethods";

const register = contextMenuMethods["contextMenu.register"].run;
const unregister = contextMenuMethods["contextMenu.unregister"].run;
const update = contextMenuMethods["contextMenu.update"].run;

const icons: InstalledExtension = { name: "acme/icons", label: "Icons", entry: "/main.js", capabilities: [] };

const row = (fields: Record<string, unknown> = {}) => ({
	name: "replace",
	label: "Replace with icon",
	action: "icons.pick",
	...fields,
});

/** What ContextMenu.vue passes to condition, disabled and action. */
const clicked = (blockId = "block-7", fromLayersPanel = false) =>
	({ block: { blockId }, target: {}, fromLayersPanel }) as unknown as BlockMenuContext;

const item = (key = "acme/icons:replace") =>
	blockContextMenuOptions.all.value.find((entry) => entry.name === key);

beforeEach(() => {
	snapshot.value.selection = { count: 1, blockIds: ["block-1"] };
	snapshot.value.readOnly = false;
	invoked.mockClear();
	facts.mockReset();
	facts.mockImplementation((block: { blockId: string }) => ({ blockId: block.blockId, isImage: false }));
});

afterEach(() => bridge.teardown(icons.name));

describe("register", () => {
	it("adds a row under a name the host composed", () => {
		register(row(), icons);

		expect(item()).toMatchObject({ label: "Replace with icon" });
	});

	it("refuses a row with no action, because it would do nothing", () => {
		expect(() => register({ name: "replace", label: "Replace" }, icons)).toThrow(/action/);
	});

	it("refuses a menu the editor does not have", () => {
		expect(() => register(row({ menu: "sidebar" }), icons)).toThrow(/menu/);
	});

	it("allows more than one row per extension", () => {
		register(row(), icons);
		register(row({ name: "clear", label: "Clear icon" }), icons);

		expect(item()).toBeDefined();
		expect(item("acme/icons:clear")).toBeDefined();
	});
});

describe("which menu the row belongs to", () => {
	it("shows in both menus by default", () => {
		register(row(), icons);

		expect(item()!.condition!(clicked("block-7", false))).toBe(true);
		expect(item()!.condition!(clicked("block-7", true))).toBe(true);
	});

	it("keeps a canvas row out of the layers panel", () => {
		register(row({ menu: "canvas" }), icons);

		expect(item()!.condition!(clicked("block-7", false))).toBe(true);
		expect(item()!.condition!(clicked("block-7", true))).toBe(false);
	});

	it("keeps a layers row out of the canvas", () => {
		register(row({ menu: "layers" }), icons);

		expect(item()!.condition!(clicked("block-7", true))).toBe(true);
		expect(item()!.condition!(clicked("block-7", false))).toBe(false);
	});
});

describe("the rule answers for the clicked block", () => {
	it("asks the clicked block, not the selection", () => {
		register(row({ showWhen: { isImage: true } }), icons);
		facts.mockImplementation((block: { blockId: string }) => ({
			blockId: block.blockId,
			isImage: block.blockId === "block-7",
		}));

		expect(item()!.condition!(clicked("block-7"))).toBe(true);
		expect(item()!.condition!(clicked("block-8"))).toBe(false);
	});

	it("keeps count from the real selection", () => {
		register(row({ showWhen: { count: 3 } }), icons);
		snapshot.value.selection = { count: 3, blockIds: ["a", "b", "c"] };

		expect(item()!.condition!(clicked())).toBe(true);
	});

	it("reads an editor field from the snapshot", () => {
		register(row({ showWhen: { readOnly: true } }), icons);

		expect(item()!.condition!(clicked())).toBe(false);
		snapshot.value.readOnly = true;
		expect(item()!.condition!(clicked())).toBe(true);
	});

	it("refuses a rule key the host does not own", () => {
		expect(() => register(row({ showWhen: { isFancy: true } }), icons)).toThrow(/isFancy/);
	});
});

describe("the action", () => {
	it("sends only what can cross a port", () => {
		register(row(), icons);
		item()!.action(clicked("block-7", true));

		expect(invoked).toHaveBeenCalledWith(icons, "icons.pick", {
			blockId: "block-7",
			fromLayersPanel: true,
		});
	});
});

describe("disabled", () => {
	it("enables a row that states no rule", () => {
		register(row(), icons);

		expect(item()!.disabled!(clicked())).toBe(false);
	});

	it("disables a row whose enableWhen does not match", () => {
		register(row({ enableWhen: { readOnly: false } }), icons);
		snapshot.value.readOnly = true;

		expect(item()!.disabled!(clicked())).toBe(true);
	});

	it("disables a row through the enabled flag", () => {
		register(row(), icons);
		update({ name: "replace", patch: { enabled: false } }, icons);

		expect(item()!.disabled!(clicked())).toBe(true);
	});
});

describe("update, unregister and teardown", () => {
	it("changes the label", () => {
		register(row(), icons);
		update({ name: "replace", patch: { label: "Swap icon" } }, icons);

		expect(item()!.label).toBe("Swap icon");
	});

	it("hides the row through the visible flag", () => {
		register(row(), icons);
		update({ name: "replace", patch: { visible: false } }, icons);

		expect(item()!.condition!(clicked())).toBe(false);
	});

	it("removes the row", () => {
		register(row(), icons);
		unregister({ name: "replace" }, icons);

		expect(item()).toBeUndefined();
	});

	it("drops every row when the extension is torn down", () => {
		register(row(), icons);
		register(row({ name: "clear", label: "Clear" }), icons);
		bridge.teardown(icons.name);

		expect(blockContextMenuOptions.all.value).toEqual([]);
	});
});
