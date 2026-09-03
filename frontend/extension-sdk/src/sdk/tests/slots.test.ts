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

	it("does not run main in a panel frame", async () => {
		const main = vi.fn();
		slots.registerMain(main);
		slots.registerSlot("panel", { component: () => Promise.resolve({ mount: () => {} }) });
		document.body.innerHTML = `<div id="app"></div>`;

		slots.setActiveSlot("panel");
		await slots.runSlot();

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

	it("refuses a second mount adapter", () => {
		slots.use(() => {});

		expect(() => slots.use(() => {})).toThrow(/already registered/);
	});

	it("refuses a second registration of one visual slot", () => {
		slots.registerSlot("panel", { component: () => Promise.resolve({}) });

		expect(() => slots.registerSlot("panel", { component: () => Promise.resolve({}) })).toThrow(
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
			slots.registerSlot("panel", { component: () => Promise.resolve({ mount }) });

			slots.setActiveSlot("panel");
			await slots.runSlot({ query: "star" });

			expect(mount).toHaveBeenCalledWith(root, { query: "star" });
		});

		it("loads nothing for the slot this frame is not", async () => {
			const component = vi.fn(() => Promise.resolve({ mount: () => {} }));
			slots.registerSlot("panel", { component });
			slots.registerSlot("dialog", { component: () => Promise.resolve({ mount: () => {} }) });

			slots.setActiveSlot("dialog");
			await slots.runSlot();

			expect(component).not.toHaveBeenCalled();
		});

		// a component object, and no adapter to turn it into DOM
		it("names the vue layer when the module exports no mount and no adapter is registered", async () => {
			slots.registerSlot("panel", { component: () => Promise.resolve({ default: { render: () => {} } }) });

			slots.setActiveSlot("panel");

			await expect(slots.runSlot()).rejects.toThrow(/extension-sdk\/vue/);
		});

		it("hands a default-exported component to the registered adapter", async () => {
			const component = { render: () => {} };
			const adapter = vi.fn();
			slots.use(adapter);
			slots.registerSlot("panel", { component: () => Promise.resolve({ default: component }) });

			slots.setActiveSlot("panel");
			await slots.runSlot({ query: "star" });

			expect(adapter).toHaveBeenCalledWith(component, root, { query: "star" });
		});

		// a module that mounts itself needs no adapter, and must not be handed to one
		it("prefers the module's own mount over the adapter", async () => {
			const adapter = vi.fn();
			const mount = vi.fn();
			slots.use(adapter);
			slots.registerSlot("panel", { component: () => Promise.resolve({ mount, default: {} }) });

			slots.setActiveSlot("panel");
			await slots.runSlot();

			expect(mount).toHaveBeenCalledOnce();
			expect(adapter).not.toHaveBeenCalled();
		});

		it("runs the cleanup the adapter returned when the frame goes away", async () => {
			const cleanup = vi.fn();
			slots.use(() => cleanup);
			slots.registerSlot("panel", { component: () => Promise.resolve({ default: {} }) });

			slots.setActiveSlot("panel");
			await slots.runSlot();
			window.dispatchEvent(new Event("pagehide"));

			expect(cleanup).toHaveBeenCalled();
		});

		it("runs the cleanup the module returned when the frame goes away", async () => {
			const cleanup = vi.fn();
			slots.registerSlot("panel", { component: () => Promise.resolve({ mount: () => cleanup }) });

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
