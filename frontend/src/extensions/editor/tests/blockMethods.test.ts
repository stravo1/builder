import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The canvas is mocked, so this runs without pinia. `Block` is not: the write
 * path is what is under test, and a fake block would prove nothing about
 * `setStyle` choosing a breakpoint's style map.
 */
const tree = new Map<string, unknown>();
let made = 0;
const canvas = {
	editableBlock: null as unknown,
	activeCanvas: {
		findBlock: (id: string) => tree.get(id) ?? null,
		activeBreakpoint: "desktop",
		selectedBlockIds: new Set<string>(),
		clearSelection: () => canvas.activeCanvas.selectedBlockIds.clear(),
		toggleBlockSelection: (block: { blockId: string }) =>
			canvas.activeCanvas.selectedBlockIds.add(block.blockId),
	},
};

vi.mock("@/stores/canvasStore", () => ({ default: () => canvas }));
vi.mock("@/utils/helpers", () => ({
	getBlockObject: (block: Record<string, unknown>) => ({ copied: block.blockId }),
}));

import { blockMethods } from "../blockMethods";
import type { Capability, InstalledExtension } from "frappe-builder-extension-sdk/types";

const record = (capabilities: Capability[] = ["block.read", "block.update"]): InstalledExtension => ({
	name: "acme/icons",
	label: "Icons",
	entry: "/builder_extension_asset/acme-icons@1.0.0/main.js",
	capabilities,
});

/** Only the members `blockMethods` touches, so a change here names what it uses. */
const block = (blockId: string) => {
	const node = {
		blockId,
		attributes: {} as Record<string, string | undefined>,
		classes: [] as string[],
		innerHTML: "",
		baseStyles: {} as Record<string, unknown>,
		tabletStyles: {} as Record<string, unknown>,
		mobileStyles: {} as Record<string, unknown>,
		setAttribute(attribute: string, value: string | undefined) {
			node.attributes[attribute] = value;
		},
		setInnerHTML(html: string) {
			node.innerHTML = html;
		},
		children: [] as Array<Record<string, unknown>>,
		addChild(options: Record<string, unknown>, index: number | undefined, select: boolean) {
			const child = block(`block-child-${made++}`);
			Object.assign(child, options, { selected: select });
			node.children.splice(index ?? node.children.length, 0, child);
			// what `Block.addChild` does at block.ts:595, whatever `select` says
			if (options.element === "label") {
				canvas.activeCanvas.selectedBlockIds = new Set([child.blockId]);
				canvas.editableBlock = child;
			}
			return child;
		},
		setStyle(style: string, value: unknown, breakpoint?: string) {
			const target =
				breakpoint === "mobile"
					? node.mobileStyles
					: breakpoint === "tablet"
					? node.tabletStyles
					: node.baseStyles;
			if (value === null || value === "") delete target[style];
			else target[style] = value;
		},
	};
	tree.set(blockId, node);
	return node;
};

const update = (params: unknown) => blockMethods["block.update"].run(params, record());
const insert = (params: unknown) =>
	blockMethods["block.insert"].run(params, record()) as { blockId: string; keys: Record<string, string> };
const get = (params: unknown) => blockMethods["block.get"].run(params, record());

const codeOf = (call: () => unknown) => {
	try {
		call();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return undefined;
};

beforeEach(() => {
	tree.clear();
	made = 0;
	canvas.editableBlock = null;
	canvas.activeCanvas.selectedBlockIds = new Set();
});

describe("the capabilities", () => {
	it("gates the read and the write separately", () => {
		expect(blockMethods["block.get"].needs).toBe("block.read");
		expect(blockMethods["block.update"].needs).toBe("block.update");
	});

	// adding a block changes what the page is, not what one block holds
	it("gates inserting apart from updating", () => {
		expect(blockMethods["block.insert"].needs).toBe("block.insert");
	});
});

describe("resolving an id", () => {
	it("refuses an id the page does not hold", () => {
		expect(codeOf(() => get({ blockId: "block-nope" }))).toBe("unknown_block");
	});

	it("refuses a missing id", () => {
		expect(codeOf(() => get({}))).toBe("invalid_params");
	});

	it("refuses an id that is not a string", () => {
		expect(codeOf(() => get({ blockId: 7 }))).toBe("invalid_params");
	});
});

describe("block.get", () => {
	it("answers with the copy Builder makes for itself", () => {
		block("block-1");

		expect(get({ blockId: "block-1" })).toEqual({ copied: "block-1" });
	});
});

describe("block.update", () => {
	it("writes an attribute", () => {
		const node = block("block-1");
		update({ blockId: "block-1", attributes: { "data-icon": "star" } });

		expect(node.attributes["data-icon"]).toBe("star");
	});

	it("removes an attribute the patch sets to null", () => {
		const node = block("block-1");
		node.setAttribute("data-icon", "star");
		update({ blockId: "block-1", attributes: { "data-icon": null } });

		expect(node.attributes["data-icon"]).toBeUndefined();
	});

	it("writes a style at the active breakpoint by default", () => {
		const node = block("block-1");
		update({ blockId: "block-1", styles: { fill: "red" } });

		expect(node.baseStyles.fill).toBe("red");
		expect(node.mobileStyles.fill).toBeUndefined();
	});

	it("writes a style at the breakpoint the patch names", () => {
		const node = block("block-1");
		update({ blockId: "block-1", styles: { fill: "red" }, breakpoint: "mobile" });

		expect(node.mobileStyles.fill).toBe("red");
		expect(node.baseStyles.fill).toBeUndefined();
	});

	it("deletes a style the patch sets to null", () => {
		const node = block("block-1");
		node.setStyle("fill", "red");
		update({ blockId: "block-1", styles: { fill: null } });

		expect(node.baseStyles.fill).toBeUndefined();
	});

	it("replaces the class list", () => {
		const node = block("block-1");
		node.classes = ["old"];
		update({ blockId: "block-1", classes: ["rounded", "p-2"] });

		expect(node.classes).toEqual(["rounded", "p-2"]);
	});

	it("writes innerHTML", () => {
		const node = block("block-1");
		update({ blockId: "block-1", innerHTML: "<svg />" });

		expect(node.innerHTML).toBe("<svg />");
	});

	it("writes every key of one patch", () => {
		const node = block("block-1");
		update({
			blockId: "block-1",
			attributes: { "data-icon": "star" },
			styles: { fill: "red" },
			classes: ["rounded"],
			innerHTML: "<svg />",
		});

		expect(node.attributes["data-icon"]).toBe("star");
		expect(node.baseStyles.fill).toBe("red");
		expect(node.classes).toEqual(["rounded"]);
		expect(node.innerHTML).toBe("<svg />");
	});
});

describe("what a patch may not say", () => {
	it("refuses a patch that changes nothing", () => {
		block("block-1");

		expect(codeOf(() => update({ blockId: "block-1" }))).toBe("invalid_params");
	});

	it("refuses attributes that are not an object", () => {
		block("block-1");

		expect(codeOf(() => update({ blockId: "block-1", attributes: ["a"] }))).toBe("invalid_params");
	});

	it("refuses a style value that is not a string, a number or null", () => {
		block("block-1");

		expect(codeOf(() => update({ blockId: "block-1", styles: { fill: {} } }))).toBe("invalid_params");
	});

	it("refuses classes that are not a list of strings", () => {
		block("block-1");

		expect(codeOf(() => update({ blockId: "block-1", classes: [1, 2] }))).toBe("invalid_params");
	});

	it("refuses a breakpoint the canvas does not have", () => {
		block("block-1");

		expect(codeOf(() => update({ blockId: "block-1", styles: { fill: "red" }, breakpoint: "watch" }))).toBe(
			"invalid_params",
		);
	});

	// the id is resolved before anything is written, so a bad id changes nothing
	it("writes nothing when the id is unknown", () => {
		const node = block("block-1");
		codeOf(() => update({ blockId: "block-2", attributes: { "data-icon": "star" } }));

		expect(node.attributes["data-icon"]).toBeUndefined();
	});
});

describe("inserting a block", () => {
	const parent = () => tree.get("block-1") as Record<string, any>;

	it("appends a child and answers with its id", () => {
		block("block-1");
		const { blockId } = insert({ parentId: "block-1", block: { element: "div" } });

		expect(parent().children).toHaveLength(1);
		expect(parent().children[0].blockId).toBe(blockId);
		expect(parent().children[0].element).toBe("div");
	});

	it("puts it where index says", () => {
		block("block-1");
		insert({ parentId: "block-1", block: { element: "span" } });
		const { blockId } = insert({ parentId: "block-1", block: { element: "div" }, index: 0 });

		expect(parent().children[0].blockId).toBe(blockId);
	});

	it("writes the attributes, the classes, the markup and the styles", () => {
		block("block-1");
		insert({
			parentId: "block-1",
			block: {
				element: "div",
				attributes: { "data-icon": "star" },
				classes: ["sample"],
				innerHTML: "<svg />",
				styles: { color: "red" },
			},
		});

		const child = parent().children[0];
		expect(child.attributes["data-icon"]).toBe("star");
		expect(child.classes).toEqual(["sample"]);
		expect(child.innerHTML).toBe("<svg />");
		expect(child.baseStyles.color).toBe("red");
	});

	it("puts a style on the breakpoint the call names", () => {
		block("block-1");
		insert({
			parentId: "block-1",
			block: { element: "div", styles: { color: "red" } },
			breakpoint: "mobile",
		});

		expect(parent().children[0].mobileStyles.color).toBe("red");
	});

	// the selection is the user's, not the extension's
	it("leaves the new block unselected", () => {
		block("block-1");
		insert({ parentId: "block-1", block: { element: "div" } });

		expect(parent().children[0].selected).toBe(false);
	});

	it("refuses a parent the page does not hold", () => {
		expect(codeOf(() => insert({ parentId: "block-nope", block: { element: "div" } }))).toBe("unknown_block");
	});

	it("refuses a block with no element", () => {
		block("block-1");
		expect(codeOf(() => insert({ parentId: "block-1", block: {} }))).toBe("invalid_params");
	});

	it("refuses an element name that is not one", () => {
		block("block-1");
		expect(codeOf(() => insert({ parentId: "block-1", block: { element: "<script>" } }))).toBe(
			"invalid_params",
		);
	});

	it("refuses an index that is not a whole number", () => {
		block("block-1");
		expect(codeOf(() => insert({ parentId: "block-1", block: { element: "div" }, index: -1 }))).toBe(
			"invalid_params",
		);
	});
});

describe("inserting a tree", () => {
	const parent = () => tree.get("block-1") as Record<string, any>;
	const nest = (depth: number): Record<string, unknown> =>
		depth === 1 ? { element: "div" } : { element: "div", children: [nest(depth - 1)] };

	it("builds every node of one call, in the order it was sent", () => {
		block("block-1");
		const { blockId } = insert({
			parentId: "block-1",
			block: {
				element: "form",
				children: [{ element: "label" }, { element: "input", children: [{ element: "span" }] }],
			},
		});

		const form = parent().children[0];
		expect(form.blockId).toBe(blockId);
		expect(form.children.map((child: Record<string, unknown>) => child.element)).toEqual([
			"label",
			"input",
		]);
		expect(form.children[1].children[0].element).toBe("span");
	});

	// a form builder has to find its own submit button again
	it("answers with every key, mapped to the block it made", () => {
		block("block-1");
		const { keys } = insert({
			parentId: "block-1",
			block: {
				element: "form",
				key: "form",
				children: [{ element: "button", key: "submit" }],
			},
		});

		const form = parent().children[0];
		expect(keys.form).toBe(form.blockId);
		expect(keys.submit).toBe(form.children[0].blockId);
	});

	it("answers with an empty map when the tree named no key", () => {
		block("block-1");
		expect(insert({ parentId: "block-1", block: { element: "div" } }).keys).toEqual({});
	});

	it("writes a child's attributes and styles, at the breakpoint the call names", () => {
		block("block-1");
		insert({
			parentId: "block-1",
			block: {
				element: "form",
				children: [{ element: "input", attributes: { name: "email" }, styles: { color: "red" } }],
			},
			breakpoint: "mobile",
		});

		const input = parent().children[0].children[0];
		expect(input.attributes.name).toBe("email");
		expect(input.mobileStyles.color).toBe("red");
	});

	it("refuses two blocks that share a key", () => {
		block("block-1");
		expect(
			codeOf(() =>
				insert({
					parentId: "block-1",
					block: { element: "div", key: "same", children: [{ element: "div", key: "same" }] },
				}),
			),
		).toBe("invalid_params");
	});

	it("refuses children that are not a list", () => {
		block("block-1");
		expect(
			codeOf(() => insert({ parentId: "block-1", block: { element: "div", children: {} } })),
		).toBe("invalid_params");
	});

	it("refuses a tree deeper than the cap", () => {
		block("block-1");
		expect(codeOf(() => insert({ parentId: "block-1", block: nest(21) }))).toBe("invalid_params");
	});

	it("takes a tree at the cap", () => {
		block("block-1");
		expect(codeOf(() => insert({ parentId: "block-1", block: nest(20) }))).toBeUndefined();
	});

	it("refuses a tree holding more blocks than the cap", () => {
		block("block-1");
		const children = Array.from({ length: 200 }, () => ({ element: "div" }));
		expect(codeOf(() => insert({ parentId: "block-1", block: { element: "div", children } }))).toBe(
			"invalid_params",
		);
	});

	// the whole tree is read before the first addChild, so a bad node deep in it
	// cannot leave half a form in the page
	it("adds nothing when a node anywhere in the tree is refused", () => {
		block("block-1");
		codeOf(() =>
			insert({
				parentId: "block-1",
				block: {
					element: "form",
					children: [{ element: "label" }, { element: "<script>" }],
				},
			}),
		);

		expect(parent().children).toHaveLength(0);
	});
});

// `makeBlockEditable` selects a text block whatever `addChild` was told, so the
// method has to put the user's selection back
describe("what an insert leaves selected", () => {
	it("puts the selection back after a text block took it", async () => {
		block("block-1");
		canvas.activeCanvas.selectedBlockIds = new Set(["block-1"]);

		insert({ parentId: "block-1", block: { element: "form", children: [{ element: "label" }] } });
		await nextTick();

		expect([...canvas.activeCanvas.selectedBlockIds]).toEqual(["block-1"]);
		expect(canvas.editableBlock).toBeNull();
	});

	it("leaves an empty selection empty", async () => {
		block("block-1");
		insert({ parentId: "block-1", block: { element: "label" } });
		await nextTick();

		expect([...canvas.activeCanvas.selectedBlockIds]).toEqual([]);
	});
});
