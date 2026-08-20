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
