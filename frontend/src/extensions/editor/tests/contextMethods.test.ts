import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, reactive } from "vue";

/**
 * The stores are mocked the way `editorContext.test.ts` mocks them, so this runs
 * without pinia. The bridge is mocked too: what is under test is which frames
 * hear what, not how a channel is held.
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
vi.stubGlobal("window", { is_developer_mode: 0, is_fc_site: 0 });

const emitted: Array<{ frame: string; event: string; payload: unknown }> = [];
const frames = new Map<string, string[]>();
const teardowns: Array<() => void> = [];

const channelsOf = (extension: string) =>
	(frames.get(extension) ?? []).map((frame) => ({
		emit: (event: string, payload: unknown) => emitted.push({ frame, event, payload }),
	}));

vi.mock("../../host/bridge", () => ({
	bridge: {
		getChannels: (extension: string) => channelsOf(extension),
		onTeardown: (_extension: string, unregister: () => void) => teardowns.push(unregister),
	},
}));

import type { Capability, InstalledExtension } from "frappe-builder-extension-sdk/types";
import { contextMethods } from "../contextMethods";

const record = (name = "acme/icons", capabilities: Capability[] = ["context.read"]): InstalledExtension => ({
	name,
	label: "Icons",
	entry: "/builder_extension_asset/acme-icons@1.0.0/main.js",
	capabilities,
});

const subscribe = (fields: unknown, extension = record()) =>
	contextMethods["context.subscribe"].run({ fields }, extension);

const codeOf = (call: () => unknown) => {
	try {
		call();
	} catch (error) {
		return (error as { code?: string }).code;
	}
	return undefined;
};

/** One throttle window, plus the tick the watcher needs to run. */
const settle = async () => {
	await nextTick();
	await vi.advanceTimersByTimeAsync(150);
};

const block = (blockId: string) => ({
	blockId,
	element: "div",
	isExtendedFromComponent: () => false,
	isRoot: () => false,
	isText: () => false,
	isImage: () => false,
	isHTML: () => false,
	isSVG: () => false,
	isLink: () => false,
	isContainer: () => false,
	isVideo: () => false,
	isInput: () => false,
	isRepeater: () => false,
});

beforeEach(() => {
	vi.useFakeTimers();
	emitted.length = 0;
	teardowns.splice(0).forEach((stop) => stop());
	frames.clear();
	frames.set("acme/icons", ["main"]);
	selectedBlocks.splice(0, selectedBlocks.length);
	builder.readOnlyMode = false;
	canvas.activeCanvas = { activeBreakpoint: "desktop" };
});

describe("the capability", () => {
	it("gates both methods behind context.read", () => {
		expect(contextMethods["context.get"].needs).toBe("context.read");
		expect(contextMethods["context.subscribe"].needs).toBe("context.read");
	});
});

describe("context.get", () => {
	it("answers with the whole snapshot", () => {
		const context = contextMethods["context.get"].run(undefined, record()) as Record<string, unknown>;

		expect(Object.keys(context).sort()).toEqual(
			["breakpoint", "editingMode", "isAIEnabled", "page", "readOnly", "selection", "site"].sort(),
		);
	});
});

describe("what a subscription accepts", () => {
	it("refuses a missing field list", () => {
		expect(codeOf(() => subscribe(undefined))).toBe("invalid_params");
	});

	it("refuses an empty field list", () => {
		expect(codeOf(() => subscribe([]))).toBe("invalid_params");
	});

	it("refuses a field the snapshot does not hold", () => {
		expect(codeOf(() => subscribe(["revision"]))).toBe("invalid_params");
	});

	it("accepts every field the snapshot holds", () => {
		const every = ["selection", "breakpoint", "editingMode", "readOnly", "isAIEnabled", "page", "site"];

		expect(() => subscribe(every)).not.toThrow();
	});
});

describe("what a subscriber hears", () => {
	it("pushes nothing until something changes", async () => {
		subscribe(["selection"]);
		await settle();

		expect(emitted).toEqual([]);
	});

	it("pushes a field that changed", async () => {
		subscribe(["selection"]);
		selectedBlocks.push(block("block-1"));
		await settle();

		expect(emitted).toHaveLength(1);
		expect(emitted[0].event).toBe("context");
		const { selection } = emitted[0].payload as { selection: Record<string, unknown> };
		expect(selection.count).toBe(1);
		expect(selection.blockId).toBe("block-1");
	});

	// a handler destructures every field it named, so a partial payload would
	// throw inside the frame whenever one field moved on its own
	it("carries every subscribed field, not only the one that changed", async () => {
		subscribe(["selection", "readOnly"]);
		builder.readOnlyMode = true;
		await settle();

		expect(emitted[0].payload).toEqual({
			readOnly: true,
			selection: { count: 0, blockIds: [] },
		});
	});

	it("says nothing when a field it did not name changes", async () => {
		subscribe(["readOnly"]);
		selectedBlocks.push(block("block-1"));
		await settle();

		expect(emitted).toEqual([]);
	});

	it("does not repeat a value it already sent", async () => {
		subscribe(["readOnly"]);
		builder.readOnlyMode = true;
		await settle();
		builder.readOnlyMode = true;
		selectedBlocks.push(block("block-1"));
		await settle();

		expect(emitted).toHaveLength(1);
	});

	/**
	 * The throttle leads and trails: the first change of a burst goes at once, so
	 * a single click feels immediate, and the last state of the burst follows one
	 * window later. Everything between them is dropped.
	 */
	it("sends the first change at once and coalesces the rest", async () => {
		subscribe(["selection"]);
		selectedBlocks.push(block("block-1"));
		await nextTick();
		selectedBlocks.push(block("block-2"));
		await nextTick();
		selectedBlocks.push(block("block-3"));
		await settle();

		expect(emitted).toHaveLength(2);
		expect(emitted.at(-1)?.payload).toEqual({
			selection: { count: 3, blockIds: ["block-1", "block-2", "block-3"] },
		});
	});
});

describe("which frames hear it", () => {
	it("pushes to every live frame of the extension", async () => {
		frames.set("acme/icons", ["main", "panel"]);
		subscribe(["readOnly"]);
		builder.readOnlyMode = true;
		await settle();

		expect(emitted.map((message) => message.frame)).toEqual(["main", "panel"]);
	});

	it("says nothing to another extension", async () => {
		frames.set("acme/other", ["main"]);
		subscribe(["readOnly"]);
		builder.readOnlyMode = true;
		await settle();

		expect(emitted.every((message) => message.frame === "main")).toBe(true);
		expect(emitted).toHaveLength(1);
	});
});

describe("a second subscription from the same extension", () => {
	it("adds its fields rather than replacing them", async () => {
		subscribe(["selection"]);
		subscribe(["readOnly"]);
		builder.readOnlyMode = true;
		selectedBlocks.push(block("block-1"));
		await settle();

		const payload = emitted[0].payload as Record<string, unknown>;
		expect(Object.keys(payload).sort()).toEqual(["readOnly", "selection"]);
		expect(payload.readOnly).toBe(true);
	});
});

describe("teardown", () => {
	it("stops pushing to an extension that was torn down", async () => {
		subscribe(["readOnly"]);
		teardowns.splice(0).forEach((stop) => stop());
		builder.readOnlyMode = true;
		await settle();

		expect(emitted).toEqual([]);
	});
});
