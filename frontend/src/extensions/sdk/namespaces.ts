/**
 * `builder.<surface>.<verb>` over one call.
 *
 * Registrations are declarations, written at module scope. Every frame of an
 * extension imports the same module, so every frame reads them — which is what
 * lets a panel tab declare the document it loads in the same breath as the tab
 * itself, even though the two are used in different frames.
 *
 * Only the entry frame tells the host. A declaration read in a panel frame
 * records what that frame needs locally and sends nothing, so the host hears
 * each registration once however many frames are open.
 *
 * Nothing is validated here. The host validates every parameter (1.12), and a
 * copy of a rule on this side would be a second thing to keep in step.
 */

import { holdAction, releaseAction, type ActionHandler } from "./actions";
import { getChannel } from "./connect";
import { activeSlot, registerSlot } from "./slots";

/** An imperative call. Any frame may make one: `update` and `run` are not declarations. */
const call = (method: string, params?: unknown) => getChannel().call(method, params);

/**
 * A declaration. The host hears it from the entry frame only.
 *
 * A refusal is logged as well as returned, because a declaration at module scope
 * is usually not awaited, and a silently rejected registration is a surface that
 * never appears with nothing to explain it.
 */
const declare = (method: string, params?: unknown) => {
	if (activeSlot() !== "main") return Promise.resolve();

	const sent = call(method, params);
	sent.catch((error) => console.error(`[builder] "${method}" was refused`, error));
	return sent;
};

export type ShowWhen = Record<string, unknown>;

/** Resolves to the module holding a slot's document. */
export type SlotLoader = () => Promise<unknown>;

export type LeftPanelRegistration = {
	name: string;
	label: string;
	icon: string;
	/** What the tab's frame paints. Declared here because the tab is what shows it. */
	load?: SlotLoader;
	before?: string;
	after?: string;
	showWhen?: ShowWhen;
};

export type ToolbarRegistration = {
	name: string;
	region: "left" | "center" | "right";
	icon: string;
	label?: string;
	tooltip?: string;
	/** The name of an action this extension registered. */
	action?: string;
	badge?: string | number | null;
	before?: string;
	after?: string;
	showWhen?: ShowWhen;
	enableWhen?: ShowWhen;
};

export type ContextMenuRegistration = {
	name: string;
	label: string;
	/** The name of an action this extension registered. A row with none does nothing. */
	action: string;
	/** Which menu the row belongs to. Fixed at registration. Defaults to "both". */
	menu?: "canvas" | "layers" | "both";
	before?: string;
	after?: string;
	showWhen?: ShowWhen;
	enableWhen?: ShowWhen;
};

export type ItemPatch = {
	visible?: boolean;
	enabled?: boolean;
	label?: string;
	icon?: string;
	tooltip?: string;
	badge?: string | number | null;
};

export const leftPanel = {
	register: ({ load, ...registration }: LeftPanelRegistration) => {
		// recorded in every frame, used in the panel frame, sent by neither
		if (load) registerSlot("panel", { load });
		return declare("leftPanel.register", registration);
	},
	unregister: (name: string) => call("leftPanel.unregister", { name }),
	update: (name: string, patch: ItemPatch) => call("leftPanel.update", { name, patch }),
};

export const toolbar = {
	register: (registration: ToolbarRegistration) => declare("toolbar.register", registration),
	unregister: (name: string) => call("toolbar.unregister", { name }),
	update: (name: string, patch: ItemPatch) => call("toolbar.update", { name, patch }),
};

export const contextMenu = {
	register: (registration: ContextMenuRegistration) => declare("contextMenu.register", registration),
	unregister: (name: string) => call("contextMenu.unregister", { name }),
	update: (name: string, patch: ItemPatch) => call("contextMenu.update", { name, patch }),
};

export const actions = {
	/**
	 * The handler stays in this frame, and the host learns only the name.
	 *
	 * Held in every frame and named to the host by the entry frame alone, so the
	 * host always calls the frame that outlives the others.
	 */
	register: (name: string, handler: ActionHandler) => {
		holdAction(name, handler);
		return declare("actions.register", { name });
	},
	unregister: (name: string) => {
		releaseAction(name);
		return call("actions.unregister", { name });
	},
	/** Runs an action this extension owns, from any of its frames. */
	run: (name: string, context?: Record<string, unknown>) => call("actions.run", { name, context }),
};
