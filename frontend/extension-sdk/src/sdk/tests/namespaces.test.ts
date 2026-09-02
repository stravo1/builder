import { beforeEach, describe, expect, it, vi } from "vitest";

const call = vi.fn();

vi.mock("../connect", () => ({ getChannel: () => ({ call }) }));

const loadNamespaces = async () => {
	vi.resetModules();
	const slots = await import("../slots");
	const namespaces = await import("../namespaces");
	const actions = await import("../actions");
	return { slots, namespaces, actions };
};

describe("actions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		call.mockResolvedValue(undefined);
	});

	it("holds and declares an action in the main frame", async () => {
		const { slots, namespaces, actions } = await loadNamespaces();
		const handler = vi.fn(() => "done");
		slots.setActiveSlot("main");

		await namespaces.actions.register("sample.run", handler);

		expect(call).toHaveBeenCalledWith("actions.register", { name: "sample.run" });
		expect(actions.runAction({ action: "sample.run" })).toBe("done");
	});

	it("does not hold or declare an action in a visual frame", async () => {
		const { slots, namespaces, actions } = await loadNamespaces();
		slots.setActiveSlot("panel");

		await namespaces.actions.register("sample.run", () => "done");

		expect(call).not.toHaveBeenCalled();
		expect(() => actions.runAction({ action: "sample.run" })).toThrow(/registered no action/);
	});
});

describe("a function action", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		call.mockResolvedValue(undefined);
	});

	it("registers itself under the item's own name and sends the name", async () => {
		const { slots, namespaces, actions } = await loadNamespaces();
		slots.setActiveSlot("main");

		await namespaces.contextMenu.register({ name: "tidy", label: "Tidy", action: () => "done" });

		expect(call).toHaveBeenCalledWith("actions.register", { name: "tidy" });
		expect(call).toHaveBeenCalledWith("contextMenu.register", { name: "tidy", label: "Tidy", action: "tidy" });
		expect(actions.runAction({ action: "tidy" })).toBe("done");
	});

	it("hands the handler the context the host sends", async () => {
		const { slots, namespaces, actions } = await loadNamespaces();
		const handler = vi.fn();
		slots.setActiveSlot("main");

		await namespaces.toolbar.register({ name: "tidy", region: "left", icon: "star", action: handler });
		actions.runAction({ action: "tidy", context: { blockId: "abc" } });

		expect(handler).toHaveBeenCalledWith({ blockId: "abc" });
	});

	it("leaves a string action alone", async () => {
		const { slots, namespaces } = await loadNamespaces();
		slots.setActiveSlot("main");

		await namespaces.toolbar.register({ name: "tidy", region: "left", icon: "star", action: "other" });

		expect(call).not.toHaveBeenCalledWith("actions.register", expect.anything());
		expect(call).toHaveBeenCalledWith("toolbar.register", {
			name: "tidy",
			region: "left",
			icon: "star",
			action: "other",
		});
	});

	it("holds a control's action under its section's name", async () => {
		const { slots, namespaces, actions } = await loadNamespaces();
		slots.setActiveSlot("main");

		await namespaces.properties.registerSection({
			name: "spacing",
			controls: [{ name: "gap", control: "number", action: () => "done" }],
		});

		expect(call).toHaveBeenCalledWith("actions.register", { name: "spacing.gap" });
		expect(actions.runAction({ action: "spacing.gap" })).toBe("done");
	});

	it("resolves the actions setControls replaces a section with", async () => {
		const { slots, namespaces, actions } = await loadNamespaces();
		slots.setActiveSlot("main");

		await namespaces.properties.setControls("spacing", [
			{ name: "gap", control: "number", action: () => "done" },
		]);

		expect(call).toHaveBeenCalledWith("properties.setControls", {
			name: "spacing",
			controls: [{ name: "gap", control: "number", action: "spacing.gap" }],
		});
		expect(actions.runAction({ action: "spacing.gap" })).toBe("done");
	});

	// the host calls the entry frame, so a handler held anywhere else is never reached
	it("sends the name but holds nothing in a visual frame", async () => {
		const { slots, namespaces, actions } = await loadNamespaces();
		slots.setActiveSlot("panel");

		await namespaces.properties.setControls("spacing", [
			{ name: "gap", control: "number", action: () => "done" },
		]);

		expect(call).toHaveBeenCalledWith("properties.setControls", {
			name: "spacing",
			controls: [{ name: "gap", control: "number", action: "spacing.gap" }],
		});
		expect(() => actions.runAction({ action: "spacing.gap" })).toThrow(/registered no action/);
	});
});

describe("the open target", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		call.mockResolvedValue(undefined);
	});

	it("declares it from the entry frame", async () => {
		const { slots, namespaces } = await loadNamespaces();
		slots.setActiveSlot("main");

		await namespaces.open.register({ kind: "popover", width: 420 });

		expect(call).toHaveBeenCalledWith("open.register", { kind: "popover", width: 420 });
	});

	// every frame reads the entry module, so a declaration made in one of them
	// would tell the host the same thing a second and a third time
	it("sends nothing from a visual frame", async () => {
		const { slots, namespaces } = await loadNamespaces();
		slots.setActiveSlot("panel");

		await namespaces.open.register({ kind: "leftPanel", name: "icons" });

		expect(call).not.toHaveBeenCalled();
	});

	// a call, not a declaration: any frame may take the button back
	it("takes it back from any frame", async () => {
		const { slots, namespaces } = await loadNamespaces();
		slots.setActiveSlot("panel");

		await namespaces.open.unregister();

		expect(call).toHaveBeenCalledWith("open.unregister", undefined);
	});
});
