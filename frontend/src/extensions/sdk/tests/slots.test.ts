import { beforeEach, describe, expect, it, vi } from "vitest";

// each test needs a fresh module, because a slot is claimed once per frame
const loadSlots = async () => {
	vi.resetModules();
	return import("../slots");
};

describe("slots", () => {
	let slots: Awaited<ReturnType<typeof loadSlots>>;

	beforeEach(async () => {
		slots = await loadSlots();
	});

	it("runs the main handler in a main frame", () => {
		const main = vi.fn();
		slots.registerMain(main);

		slots.setActiveSlot("main");
		slots.runSlot();

		expect(main).toHaveBeenCalledOnce();
	});

	it("does not run main in a panel frame", () => {
		const main = vi.fn();
		slots.registerMain(main);
		slots.registerSlot("panel", { load: () => Promise.resolve({}) });

		slots.setActiveSlot("panel");
		slots.runSlot();

		expect(main).not.toHaveBeenCalled();
	});

	it("does nothing in a main frame that registered no main", () => {
		slots.setActiveSlot("main");

		expect(() => slots.runSlot()).not.toThrow();
	});

	it("warns when the frame's slot was never registered", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

		slots.setActiveSlot("dialog");
		slots.runSlot();

		expect(warn).toHaveBeenCalledWith(expect.stringContaining("dialog"));
		warn.mockRestore();
	});

	it("refuses a second main registration", () => {
		slots.registerMain(() => {});

		expect(() => slots.registerMain(() => {})).toThrow(/already registered/);
	});

	it("refuses a second registration of one visual slot", () => {
		slots.registerSlot("panel", { load: () => Promise.resolve({}) });

		expect(() => slots.registerSlot("panel", { load: () => Promise.resolve({}) })).toThrow(
			/already registered/,
		);
	});

	it("does not load a visual slot's module", () => {
		const load = vi.fn(() => Promise.resolve({}));
		slots.registerSlot("panel", { load });

		slots.setActiveSlot("panel");
		slots.runSlot();

		expect(load).not.toHaveBeenCalled();
	});
});
