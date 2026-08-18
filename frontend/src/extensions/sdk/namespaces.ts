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

import { getChannel } from "./connect";

const call = (method: string, params?: unknown) => getChannel().call(method, params);

export type LeftPanelRegistration = {
	name: string;
	label: string;
	icon: string;
	before?: string;
	after?: string;
	showWhen?: Record<string, unknown>;
};

export type ItemPatch = { visible?: boolean; label?: string; icon?: string };

export const leftPanel = {
	register: (registration: LeftPanelRegistration) => call("leftPanel.register", registration),
	unregister: (name: string) => call("leftPanel.unregister", { name }),
	update: (name: string, patch: ItemPatch) => call("leftPanel.update", { name, patch }),
};
