import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The stores are mocked, so this runs without pinia and without a canvas. What
 * is under test is the mapping, not Builder's state.
 */
const selectedBlocks = reactive<Array<Record<string, unknown>>>([]);
const canvas = reactive({
	editingMode: "page",
	activeCanvas: { activeBreakpoint: "desktop" } as { activeBreakpoint: string | null } | null,
});
const builder = reactive({ readOnlyMode: false, isAIEnabled: true });
const page = reactive({ activePage: null as Record<string, unknown> | null });

vi.mock("@/utils/blockController", () => ({
	default: { getSelectedBlocks: () => selectedBlocks },
}));
vi.mock("@/stores/canvasStore", () => ({ default: () => canvas }));
vi.mock("@/stores/builderStore", () => ({ default: () => builder }));
vi.mock("@/stores/pageStore", () => ({ default: () => page }));

// the site flags are globals Frappe writes onto the page, as Settings/index.ts reads them
vi.stubGlobal("window", { is_developer_mode: 0, is_fc_site: 0 });

import type Block from "@/block";
import { editorContext, factsFor } from "../editorContext";

const KINDS = [
	"isRoot",
	"isText",
	"isImage",
	"isHTML",
	"isSVG",
	"isLink",
	"isContainer",
	"isVideo",
	"isInput",
	"isRepeater",
] as const;

const block = (blockId: string, fields: Record<string, unknown> = {}) => {
	const answers: Record<string, unknown> = {
		element: "div",
		isExtendedFromComponent: () => false,
		...fields,
	};
	KINDS.forEach((kind) => (answers[kind] ??= () => false));
	return { blockId, ...answers };
};

const select = (...blocks: Array<Record<string, unknown>>) =>
	selectedBlocks.splice(0, selectedBlocks.length, ...blocks);

beforeEach(() => select());

describe("one selected block", () => {
	it("answers for that block", () => {
		select(block("block-1", { element: "h1", isText: () => true }));

		expect(editorContext.value.selection).toMatchObject({
			count: 1,
			blockIds: ["block-1"],
			blockId: "block-1",
			element: "h1",
			isText: true,
			isImage: false,
		});
	});

	it("reads isComponent as a method and isChildOfComponent as a name", () => {
		select(block("block-1", { isExtendedFromComponent: () => true, isChildOfComponent: "acme-card" }));

		expect(editorContext.value.selection).toMatchObject({
			isComponent: true,
			isChildOfComponent: true,
		});
	});
});

describe("an ambiguous selection", () => {
	it("leaves every per-block field undefined when several are selected", () => {
		select(block("block-1", { isText: () => true }), block("block-2"));
		const { selection } = editorContext.value;

		expect(selection.count).toBe(2);
		expect(selection.blockId).toBeUndefined();
		expect(selection.element).toBeUndefined();
		KINDS.forEach((kind) => expect(selection[kind]).toBeUndefined());
	});

	it("still names every selected block, in order", () => {
		select(block("block-1"), block("block-2"), block("block-3"));

		expect(editorContext.value.selection.blockIds).toEqual(["block-1", "block-2", "block-3"]);
	});

	it("leaves every per-block field undefined when nothing is selected", () => {
		const { selection } = editorContext.value;

		expect(selection).toEqual({ count: 0, blockIds: [] });
	});
});

describe("factsFor", () => {
	it("answers for the block it is given, whatever is selected", () => {
		select(block("block-1"), block("block-2"));

		expect(factsFor(block("block-9", { isImage: () => true }) as unknown as Block)).toMatchObject({
			blockId: "block-9",
			isImage: true,
		});
	});
});

describe("the editor", () => {
	it("falls back to desktop when the canvas names no breakpoint", () => {
		canvas.activeCanvas = null;

		expect(editorContext.value.breakpoint).toBe("desktop");
		canvas.activeCanvas = { activeBreakpoint: "desktop" };
	});

	it("takes the breakpoint the canvas is on", () => {
		canvas.activeCanvas = { activeBreakpoint: "mobile" };

		expect(editorContext.value.breakpoint).toBe("mobile");
		canvas.activeCanvas = { activeBreakpoint: "desktop" };
	});

	it("reports read-only mode and the AI flag", () => {
		builder.readOnlyMode = true;

		expect(editorContext.value.readOnly).toBe(true);
		expect(editorContext.value.isAIEnabled).toBe(true);
		builder.readOnlyMode = false;
	});

	it("turns the site globals into booleans", () => {
		expect(editorContext.value.site).toEqual({ isDeveloperMode: false, isFCSite: false });
	});
});

describe("the page", () => {
	it("is null while no page is open", () => {
		page.activePage = null;

		expect(editorContext.value.page).toBeNull();
	});

	it("turns Frappe's checks into booleans", () => {
		page.activePage = { route: "home", is_template: 0, is_standard: 1, published: 1 };

		expect(editorContext.value.page).toEqual({
			route: "home",
			isTemplate: false,
			isStandard: true,
			published: true,
		});
		page.activePage = null;
	});
});
