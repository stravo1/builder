/**
 * `builder.<surface>.<verb>` over one call.
 *
 * Nothing is validated here. The host validates every parameter (1.12), and a
 * copy of a rule on this side would be a second thing to keep in step. What the
 * author gets from these wrappers is the method name spelled once.
 *
 * Moved up from milestone 6, because milestone 4's surfaces have no other
 * caller, and a surface nothing can call cannot be verified in a browser.
 */

import { holdAction, releaseAction, type ActionHandler } from "./actions";
import { getChannel } from "./connect";

const call = (method: string, params?: unknown) => getChannel().call(method, params);

export type ShowWhen = Record<string, unknown>;

export type LeftPanelRegistration = {
	name: string;
	label: string;
	icon: string;
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
	register: (registration: LeftPanelRegistration) => call("leftPanel.register", registration),
	unregister: (name: string) => call("leftPanel.unregister", { name }),
	update: (name: string, patch: ItemPatch) => call("leftPanel.update", { name, patch }),
};

export const toolbar = {
	register: (registration: ToolbarRegistration) => call("toolbar.register", registration),
	unregister: (name: string) => call("toolbar.unregister", { name }),
	update: (name: string, patch: ItemPatch) => call("toolbar.update", { name, patch }),
};

export const contextMenu = {
	register: (registration: ContextMenuRegistration) => call("contextMenu.register", registration),
	unregister: (name: string) => call("contextMenu.unregister", { name }),
	update: (name: string, patch: ItemPatch) => call("contextMenu.update", { name, patch }),
};

export const actions = {
	/** The handler stays in this frame. The host learns only the name. */
	register: (name: string, handler: ActionHandler) => {
		holdAction(name, handler);
		return call("actions.register", { name });
	},
	unregister: (name: string) => {
		releaseAction(name);
		return call("actions.unregister", { name });
	},
	/** Runs an action this extension owns, from any of its frames. */
	run: (name: string, context?: Record<string, unknown>) => call("actions.run", { name, context }),
};
