import { describe, expect, it } from "vitest";
import type { ChannelCallError } from "frappe-builder-extension-sdk/transport";
import type { EditorContext, EditorSelection } from "frappe-builder-extension-sdk/types";
import { assertRule, matches, type ShowWhenRule } from "../showWhen";

const context = (
	selection: Partial<EditorSelection> = {},
	rest: Partial<EditorContext> = {},
): EditorContext => ({
	selection: {
		count: 1,
		blockIds: ["block-1"],
		blockId: "block-1",
		element: "div",
		isRoot: false,
		isText: false,
		isImage: false,
		isHTML: false,
		isSVG: false,
		isLink: false,
		isContainer: true,
		isVideo: false,
		isInput: false,
		isRepeater: false,
		isComponent: false,
		isChildOfComponent: false,
		...selection,
	},
	breakpoint: "desktop",
	editingMode: "page",
	readOnly: false,
	isAIEnabled: true,
	page: { route: "home", isTemplate: false, isStandard: false, published: true },
	site: { isDeveloperMode: false, isFCSite: false },
	...rest,
});

describe("matches", () => {
	it("matches when no rule was given", () => {
		expect(matches(undefined, context())).toBe(true);
	});

	it("matches an empty rule", () => {
		expect(matches({}, context())).toBe(true);
	});

	it("reads a block key off the selection", () => {
		expect(matches({ isText: true }, context({ isText: true }))).toBe(true);
		expect(matches({ isText: true }, context({ isText: false }))).toBe(false);
	});

	it("matches a false rule against a false fact", () => {
		expect(matches({ isRoot: false }, context({ isRoot: false }))).toBe(true);
		expect(matches({ isRoot: false }, context({ isRoot: true }))).toBe(false);
	});

	it("reads count off the selection", () => {
		expect(matches({ count: 2 }, context({ count: 2 }))).toBe(true);
		expect(matches({ count: 1 }, context({ count: 2 }))).toBe(false);
	});

	it("reads breakpoint and readOnly off the editor", () => {
		expect(matches({ breakpoint: "mobile" }, context({}, { breakpoint: "mobile" }))).toBe(true);
		expect(matches({ readOnly: true }, context({}, { readOnly: false }))).toBe(false);
	});

	it("needs every key to match", () => {
		const rule: ShowWhenRule = { count: 1, isImage: true };

		expect(matches(rule, context({ count: 1, isImage: true }))).toBe(true);
		expect(matches(rule, context({ count: 2, isImage: true }))).toBe(false);
	});

	it("hides the item when a value has the wrong type", () => {
		expect(matches({ count: "1" } as unknown as ShowWhenRule, context({ count: 1 }))).toBe(false);
	});
});

describe("assertRule", () => {
	it("accepts every key in the vocabulary", () => {
		const rule: ShowWhenRule = {
			isRoot: false,
			isText: true,
			isImage: false,
			isHTML: false,
			isContainer: true,
			count: 1,
			breakpoint: "desktop",
			readOnly: false,
		};

		expect(() => assertRule(rule)).not.toThrow();
	});

	it("accepts a missing rule", () => {
		expect(() => assertRule(undefined)).not.toThrow();
	});

	it("refuses a key the host does not own", () => {
		expect(() => assertRule({ isSVG: true } as ShowWhenRule)).toThrow(/isSVG/);
	});

	it("lists the known keys in the refusal", () => {
		expect(() => assertRule({ nope: 1 } as unknown as ShowWhenRule)).toThrow(/isRoot/);
	});

	it("refuses with a code a caller can branch on", () => {
		try {
			assertRule({ nope: 1 } as unknown as ShowWhenRule);
			expect.unreachable();
		} catch (error) {
			expect((error as ChannelCallError).code).toBe("unknown_rule_key");
		}
	});

	it("names the field it was checking", () => {
		expect(() => assertRule({ nope: 1 } as unknown as ShowWhenRule, "enableWhen")).toThrow(/enableWhen/);
	});
});
