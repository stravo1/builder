/**
 * `@builder/extension-sdk` — the object an extension imports.
 *
 * The shell loads this file, and the import map resolves the same URL for the
 * extension's own import, so both get one module instance and one channel.
 */

import { getChannel, listenForHandshake } from "./connect";
import { actions, context, contextMenu, leftPanel, properties, settings, toolbar } from "./namespaces";
import { registerMain, registerSlot, type SlotEntry } from "./slots";

export type HostInfo = { version: string; protocol: number };

const builder = {
	/**
	 * Imperative startup work, in the hidden entry frame only.
	 *
	 * Registrations do not belong here. They are declarations, and every frame
	 * needs to read them, so they go at module scope.
	 */
	main: (handler: () => void) => registerMain(handler),

	/**
	 * A dialog has no registration to hang a loader on: it is opened by
	 * `ui.openDialog`, never registered. So it declares its document on its own.
	 * A panel and a settings page carry `load` on the item that shows them.
	 */
	dialog: (entry: SlotEntry) => registerSlot("dialog", entry),

	/** One tab, registered from the entry frame and drawn by the host (Tier C). */
	leftPanel,

	/** A descriptor. Builder draws the button and posts the action back (Tier A). */
	toolbar,

	/** A row in the block menu. Its rule is answered for the block under the cursor. */
	contextMenu,

	/** Tier B. A list naming Builder's own controls, which the host renders. */
	properties,

	/** One page in the settings dialog, and the document it loads. */
	settings,

	/** The editor snapshot: read it once, or name the fields to be told about. */
	context,

	/** The functions this extension owns. A descriptor names one, the host calls it. */
	actions,

	host: {
		/** Which Builder this extension landed in. An extension ships on its own schedule. */
		info: () => getChannel().call<HostInfo>("host.info"),
	},
};

listenForHandshake();

export default builder;
