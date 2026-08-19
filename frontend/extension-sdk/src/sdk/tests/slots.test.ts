/**
 * @vitest-environment jsdom
 *
 * The mount contract puts a module into the shell's `#app`, so this file needs a
 * document. Every other test here runs without one.
 */
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

	describe("mounting a visual slot", () => {
		let root: HTMLElement;

		beforeEach(() => {
			document.body.innerHTML = `<div id="app"></div>`;
			root = document.getElementById("app") as HTMLElement;
		});

		it("loads the module and mounts it into the shell's root", async () => {
			const mount = vi.fn();
			slots.registerSlot("panel", { load: () => Promise.resolve({ mount }) });

			slots.setActiveSlot("panel");
			await slots.runSlot({ query: "star" });

			expect(mount).toHaveBeenCalledWith(root, { query: "star" });
		});

		it("loads nothing for the slot this frame is not", async () => {
			const load = vi.fn(() => Promise.resolve({ mount: () => {} }));
			slots.registerSlot("panel", { load });
			slots.registerSlot("dialog", { load: () => Promise.resolve({ mount: () => {} }) });

			slots.setActiveSlot("dialog");
			await slots.runSlot();

			expect(load).not.toHaveBeenCalled();
		});

		// the C2 shape, before the vue layer exists: a component object, not a mount
		it("names the vue layer when the module exports no mount", async () => {
			slots.registerSlot("panel", { load: () => Promise.resolve({ default: { render: () => {} } }) });

			slots.setActiveSlot("panel");

			await expect(slots.runSlot()).rejects.toThrow(/extension-sdk\/vue/);
		});

		it("runs the cleanup the module returned when the frame goes away", async () => {
			const cleanup = vi.fn();
			slots.registerSlot("panel", { load: () => Promise.resolve({ mount: () => cleanup }) });

			slots.setActiveSlot("panel");
			await slots.runSlot();
			window.dispatchEvent(new Event("pagehide"));

			expect(cleanup).toHaveBeenCalled();
		});

		it("warns and mounts nothing when this frame's slot was never registered", async () => {
			const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
			slots.setActiveSlot("panel");
			await slots.runSlot();

			expect(warn).toHaveBeenCalled();
			expect(root.innerHTML).toBe("");
			warn.mockRestore();
		});
	});
});
