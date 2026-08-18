import { reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The stores and blockController are mocked, so this runs without pinia and
 * without a canvas. What is under test is the mapping, not Builder's state.
 */
const selectedBlocks = reactive<Array<Record<string, unknown>>>([]);
const kinds = reactive({
	isRoot: false,
	isText: false,
	isImage: false,
	isHTML: false,
	isSVG: false,
	isLink: false,
	isContainer: false,
	isVideo: false,
	isInput: false,
	isRepeater: false,
});
const canvas = reactive({
	editingMode: "page",
	activeCanvas: { activeBreakpoint: "desktop" } as { activeBreakpoint: string | null } | null,
});
const builder = reactive({ readOnlyMode: false, isAIEnabled: true });
const page = reactive({ activePage: null as Record<string, unknown> | null });

vi.mock("@/utils/blockController", () => ({
	default: new Proxy(
		{ getSelectedBlocks: () => selectedBlocks },
		{ get: (target, key) => (key in target ? target[key as "getSelectedBlocks"] : () => kinds[key as keyof typeof kinds]) },
	),
}));
vi.mock("@/stores/canvasStore", () => ({ default: () => canvas }));
vi.mock("@/stores/builderStore", () => ({ default: () => builder }));
vi.mock("@/stores/pageStore", () => ({ default: () => page }));

// the site flags are globals Frappe writes onto the page, as Settings/index.ts reads them
const site = { is_developer_mode: 0, is_fc_site: 0 };
vi.stubGlobal("window", site);

// vitest hoists every vi.mock above this import. The window stub is not hoisted,
// and does not need to be: the getter reads it, module scope does not
import { editorContext } from "./editorContext";

const select = (...blocks: Array<Record<string, unknown>>) => {
	selectedBlocks.splice(0, selectedBlocks.length, ...blocks);
};

const block = (fields: Record<string, unknown> = {}) => ({
	blockId: "block-1",
	element: "div",
	isExtendedFromComponent: () => false,
	...fields,
});

describe("the selection", () => {
	beforeEach(() => {
		select();
		Object.keys(kinds).forEach((kind) => (kinds[kind as keyof typeof kinds] = false));
	});

	it("reports an empty selection", () => {
		expect(editorContext.value.selection).toMatchObject({ count: 0, blockId: null, element: "" });
	});

	it("counts every selected block", () => {
		select(block(), block());

		expect(editorContext.value.selection.count).toBe(2);
	});

	it("names the first block, whatever else is selected", () => {
		select(block({ blockId: "first", element: "h1" }), block({ blockId: "second" }));

		expect(editorContext.value.selection.blockId).toBe("first");
		expect(editorContext.value.selection.element).toBe("h1");
	});

	it("takes each kind from blockController", () => {
		select(block());
		kinds.isText = true;

		expect(editorContext.value.selection.isText).toBe(true);
		expect(editorContext.value.selection.isImage).toBe(false);
	});

	it("reads isComponent as a method and isChildOfComponent as a name", () => {
		select(block({ isExtendedFromComponent: () => true, isChildOfComponent: "acme-card" }));

		expect(editorContext.value.selection.isComponent).toBe(true);
		expect(editorContext.value.selection.isChildOfComponent).toBe(true);
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
