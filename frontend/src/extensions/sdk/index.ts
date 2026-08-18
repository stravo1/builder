/**
 * `@builder/extension-sdk` — the object an extension imports.
 *
 * The shell loads this file, and the import map resolves the same URL for the
 * extension's own import, so both get one module instance and one channel.
 */

import { getChannel, listenForHandshake } from "./connect";
import { actions, contextMenu, leftPanel, toolbar } from "./namespaces";
import { registerMain, registerSlot, type SlotEntry } from "./slots";

export type HostInfo = { version: string; protocol: number };

const builder = {
	/** Runs in the hidden entry frame. Registers surfaces, paints nothing (C2). */
	main: (handler: () => void) => registerMain(handler),

	panel: (entry: SlotEntry) => registerSlot("panel", entry),
	dialog: (entry: SlotEntry) => registerSlot("dialog", entry),
	settings: (entry: SlotEntry) => registerSlot("settings", entry),

	/** One tab, registered from the entry frame and drawn by the host (Tier C). */
	leftPanel,

	/** A descriptor. Builder draws the button and posts the action back (Tier A). */
	toolbar,

	/** A row in the block menu. Its rule is answered for the block under the cursor. */
	contextMenu,

	/** The functions this extension owns. A descriptor names one, the host calls it. */
	actions,

	host: {
		/** Which Builder this extension landed in. An extension ships on its own schedule. */
		info: () => getChannel().call<HostInfo>("host.info"),
	},
};

listenForHandshake();

export default builder;
