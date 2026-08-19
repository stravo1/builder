/**
 * @vitest-environment jsdom
 *
 * `defineSlot` mounts into a real element, and `onScopeDispose` needs a scope, so
 * this file needs a document.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, effectScope, h, nextTick } from "vue";

const subscribe = vi.fn();
const get = vi.fn();
const run = vi.fn();

vi.mock("@builder/extension-sdk", () => ({
	default: {
		context: { get: () => get(), subscribe: (...args: unknown[]) => subscribe(...args) },
		actions: { run: (...args: unknown[]) => run(...args) },
	},
}));

const { defineSlot, useAction, useBuilderContext } = await import("../vue");

/** The handler the last `subscribe` call was given, which is how a push is faked. */
const push = (payload: Record<string, unknown>) => subscribe.mock.calls.at(-1)?.[1](payload);

const deferred = () => {
	let settle: (value: unknown) => void = () => {};
	const promise = new Promise((resolve) => (settle = resolve));
	return { promise, settle };
};

describe("useBuilderContext", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		subscribe.mockReturnValue(() => {});
		get.mockResolvedValue({});
	});

	it("reads as the empty snapshot before the host answers", () => {
		const context = useBuilderContext(["selection"]);

		expect(context.selection.count).toBe(0);
		expect(context.selection.blockIds).toEqual([]);
		expect(context.readOnly).toBe(false);
		expect(context.page).toBe(null);
	});

	it("names the fields it was given", () => {
		useBuilderContext(["selection", "readOnly"]);

		expect(subscribe).toHaveBeenCalledWith(["selection", "readOnly"], expect.any(Function));
	});

	it("takes a push", async () => {
		const context = useBuilderContext(["selection"]);

		push({ selection: { count: 2, blockIds: ["a", "b"] } });

		expect(context.selection.count).toBe(2);
	});

	it("fills from the snapshot the host answers with", async () => {
		get.mockResolvedValue({ readOnly: true, breakpoint: "mobile" });
		const context = useBuilderContext(["readOnly"]);

		await vi.waitFor(() => expect(context.readOnly).toBe(true));
		expect(context.breakpoint).toBe("mobile");
	});

	it("keeps a push that landed before a slower snapshot", async () => {
		const answer = deferred();
		get.mockReturnValue(answer.promise);
		const context = useBuilderContext(["selection"]);

		push({ selection: { count: 3, blockIds: ["c"] } });
		answer.settle({ selection: { count: 0, blockIds: [] }, readOnly: true });
		await nextTick();

		expect(context.selection.count).toBe(3);
		// everything the push did not carry still lands
		expect(context.readOnly).toBe(true);
	});

	it("stops the subscription when the scope ends", () => {
		const stop = vi.fn();
		subscribe.mockReturnValue(stop);
		const scope = effectScope();

		scope.run(() => useBuilderContext(["selection"]));
		expect(stop).not.toHaveBeenCalled();

		scope.stop();
		expect(stop).toHaveBeenCalled();
	});

	it("runs outside a scope, where the caller holds the stop", () => {
		expect(() => useBuilderContext(["selection"])).not.toThrow();
	});
});

describe("useAction", () => {
	beforeEach(() => vi.clearAllMocks());

	it("runs the action it names", () => {
		useAction("sample.tag")({ blockId: "abc" });

		expect(run).toHaveBeenCalledWith("sample.tag", { blockId: "abc" });
	});

	it("takes no context at all", () => {
		useAction("sample.tag")();

		expect(run).toHaveBeenCalledWith("sample.tag", undefined);
	});
});

describe("defineSlot", () => {
	const Panel = defineComponent({
		props: { title: { type: String, default: "none" } },
		setup: (props) => () => h("p", props.title),
	});

	it("mounts the component into the element", () => {
		const element = document.createElement("div");

		defineSlot(Panel).mount(element, {});

		expect(element.textContent).toBe("none");
	});

	it("hands the props over as root props", () => {
		const element = document.createElement("div");

		defineSlot(Panel).mount(element, { title: "Pick an icon" });

		expect(element.textContent).toBe("Pick an icon");
	});

	it("unmounts through the function it returns", () => {
		const element = document.createElement("div");

		const unmount = defineSlot(Panel).mount(element, {});
		unmount();

		expect(element.textContent).toBe("");
	});

	it("takes no props at all", () => {
		const element = document.createElement("div");

		expect(() => defineSlot(Panel).mount(element)).not.toThrow();
	});
});
