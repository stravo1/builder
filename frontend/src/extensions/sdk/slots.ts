/**
 * The four slot entries an extension registers, and running the one that arrived.
 *
 * The slot names are fixed and none is a name the author picks (D5). One frame
 * runs exactly one slot, so three of these four registrations do nothing in any
 * given frame.
 */

import type { ExtensionSlot } from "../types";

export type VisualSlot = Exclude<ExtensionSlot, "main">;

/** `load` resolves to the module holding the slot's document. */
export type SlotEntry = { load: () => Promise<unknown> };

let mainHandler: (() => void) | null = null;
const visualSlots = new Map<VisualSlot, SlotEntry>();

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
 * A visual slot is recorded but not mounted. Nothing renders one until a
 * surface asks for it, and the mounting contract lands with the Vue layer.
 */
export const runSlot = (slot: ExtensionSlot) => {
	if (slot === "main") return mainHandler?.();
	if (!visualSlots.has(slot)) console.warn(`This extension registered no "${slot}" slot`);
};
