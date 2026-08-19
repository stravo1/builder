/**
 * The four slot entries an extension registers, and running the one that arrived.
 *
 * The slot names are fixed and none is a name the author picks (D5).
 *
 * Every frame imports the same entry module, so all four registrations run in
 * every frame. Only the one the handshake named is then executed. That is how
 * one module serves four frames: the frame learns which it is after the module
 * has already been read.
 *
 * It is also why `main` takes a callback and the rest take `{ load }`. The entry
 * module always runs, so `main`'s work has to be deferred to the frame that owns
 * it. A slot's module should not run at all unless this frame is that slot.
 */

import type { ExtensionSlot } from "../types";

/** The one element the shell gives a frame to paint into (D5). */
const ROOT_ID = "app";

export type VisualSlot = Exclude<ExtensionSlot, "main">;

/** `load` resolves to the module holding the slot's document. */
export type SlotEntry = { load: () => Promise<unknown> };

let mainHandler: (() => void) | null = null;
let slot: ExtensionSlot | null = null;
const visualSlots = new Map<VisualSlot, SlotEntry>();

/**
 * Set before the entry module is imported, so a registration made while that
 * module evaluates already knows which frame it is running in.
 */
export const setActiveSlot = (name: ExtensionSlot) => (slot = name);

export const getActiveSlot = () => slot;

const claim = (slot: ExtensionSlot, taken: boolean) => {
	if (taken) throw new Error(`This extension already registered its "${slot}" slot`);
};

export const registerMain = (handler: () => void) => {
	claim("main", mainHandler !== null);
	mainHandler = handler;
};

export const registerSlot = (slot: VisualSlot, entry: SlotEntry) => {
	claim(slot, visualSlots.has(slot));
	visualSlots.set(slot, entry);
};

/**
 * The contract between the SDK and an extension's document.
 *
 * `load()` resolves to a module, and a module is inert: turning a component into
 * DOM needs a framework runtime. The extension already ships one (1.14), and the
 * SDK ships none, so the extension does the mounting and the SDK only calls it.
 * That keeps `extension-sdk.js` small for an extension that draws nothing at all.
 *
 * The returned cleanup is optional, and runs when the frame goes away.
 */
type SlotModule = { mount?: (element: HTMLElement, props: Record<string, unknown>) => (() => void) | void };

let unmount: (() => void) | void = undefined;

/** Names the layer that turns a component into a `mount`, rather than just failing. */
const assertMountable = (module: SlotModule, slot: ExtensionSlot) => {
	if (typeof module.mount === "function") return;
	throw new Error(
		`The module loaded for the "${slot}" slot exports no "mount(element, props)". ` +
			`Export one, or wrap a component with "@builder/extension-sdk/vue".`,
	);
};

/**
 * Runs only the slot this frame was opened for.
 *
 * A frame that registered no slot warns rather than throws, because an extension
 * built against a newer Builder may know a slot this one never opens.
 */
export const runSlot = async (props: Record<string, unknown> = {}) => {
	if (slot === "main") return mainHandler?.();

	const entry = slot && visualSlots.get(slot);
	if (!entry) return void console.warn(`This extension registered no "${slot}" slot`);

	const root = document.getElementById(ROOT_ID);
	if (!root) throw new Error(`The extension shell has no #${ROOT_ID} to mount into`);

	const module = (await entry.load()) as SlotModule;
	assertMountable(module, slot as ExtensionSlot);
	unmount = module.mount?.(root, props);

	// the document dies with the frame, so this is for what the document owns:
	// a Vue app's unmount hooks, a timer, a subscription
	window.addEventListener("pagehide", () => unmount?.(), { once: true });
};
