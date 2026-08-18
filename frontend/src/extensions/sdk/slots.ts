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

export const activeSlot = () => slot;

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
 * Runs only the slot this frame was opened for.
 *
 * Incomplete on purpose: a visual slot is recorded, and `load` is never called.
 * Mounting needs a contract that does not make the SDK import a framework, and
 * that contract lands with the Vue layer. Until then a panel frame connects and
 * paints nothing.
 */
export const runSlot = () => {
	if (slot === "main") return mainHandler?.();
	if (slot && !visualSlots.has(slot)) console.warn(`This extension registered no "${slot}" slot`);
};
